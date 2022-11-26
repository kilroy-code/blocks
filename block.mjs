import { Croquet } from "./croquet.mjs";
import { CroquetModel } from "./model.mjs";
import { Synchronizer } from "./synchronizer.mjs";
import { BookkeepingAssembly } from "./bookkeeping.mjs";

// Blocks automatically synchronize their models.
// We split these into tiny classes for clarity.

// FIXME: do we really need both 'template' and 'spec'? If we do, let's be consistent about whether template is a getter.

class BlockSynchronizer extends BookkeepingAssembly(Object) {
  // A block acts as its own synchronizer when offline.

  // Code that is expected of a Synchronizer...
  setProperty(key, value) { // When offline, don't publish through reflector - just directly setTemplateProperty.
    this.setTemplateProperty(key, value);
  }
  detach() { // No-op. When offline there's nothing to detach.
  }
  /* fixme get isSessionRoot() { // No active session; there is no session root.
    return false;
  }*/
  get now() { // When connected, this.synchronizer.now() is Croquet time. When not connected, it is this. Often used in recorders.
    return performance.now();
  }

  // Code to maintain and use this.sychronizer...
  get isOnline() { // When offline, the block synchronizer property is 'this'.
    return this.synchronizer !== this;
  }
  get ready() { // If there is a session, answer a promise that resolves when all our traffic has been reflected.
    return (this.isOnline) && this.synchronizer.ready;
  }
  constructor(...rest) { // Initialize synchronizer.
    super(...rest);
    this.synchronizer = this;
  }
  destroy() {
    //console.log('block destroy, calling synchronizer detach', this.name);
    this.synchronizer.detach();
    super.destroy();
  }
}

/*  LIFE CYCLE
    
  Three entries:
  Block.join => Croquet.Session.join => new Synchronizer(rootCroquetModel) // Normal start of a session.
  block.join => block.destroy, Block.join                                  // Explicitly taking an existing block online (and it's children).
          !! Do we need destroy?
  (croquet resume) => new Synchronizer(rootCroquetModel)                   // Atomatic by Croquet after exposing a previous hidden tab.

  construct ROOT Synchronizer => Block.integrate(synchronizerRoot)
  Block.integrate => synchronizer.session.block?.destroy, new Block(croquetModel).integrate(synchronizer)
  block.integrate => eachChildBlock.integrate(new Synchronizer(
 */

class BlockSession extends BlockSynchronizer {
  // Setup and maintain Croquet session and Synchronizer (a Croquet.View).
  static async join(croquetOptions) {
    const options = Object.assign({}, {model: CroquetModel, view: Synchronizer}, croquetOptions),
	  session = await Croquet.Session.join(options);
    return session.block; // set by Block.integrate.
  }
  join(croquetOptions) { // Kill the old and make the new. And hook for wrapper methods.
    this.destroy(); 
    return this.constructor.join(croquetOptions);
  }
  static integrate(synchronizer) { // Called by ROOT Synchronizer constructor, on Croquet.Session.join OR resume after unhiding tab.
    // Block.join starts by asking to join a new Croquet session. It won't yet be integrated and session.block will be empty.
    // But if the tab is hidden long enough, Croquet pauses. Going back to the tab is noticed by Croquet and it
    // resumes the session by recreating the Croquet.Views. In that case, the existing session has an existing root block.
    //if (synchronizer.session.block) console.log('Synchronizer constructor is going to destroy the existing block');
    synchronizer.session.block?.destroy(); // Don't try to merge. We don't know what might have happend while we were away.

    // Regardless of whether this is join or automatic resume, now create the block structure from the croquet spec, and integrate.
    synchronizer.session.block = new Block(synchronizer.croquetModel.spec).integrate(synchronizer);
  }
  async leave() { // Leave the current synchronizing session, if any.
    let {session} = this;
    if (!session) return;
    await session.leave();
    this.session = this.session.block = null;
    return session;
  }
  constructor(...rest) {
    super(...rest);
    this.session = null; // Until integrated.
  }
  integrate(synchronizer) {
    this.synchronizer = synchronizer;
    // Once integrated, the session remains until we explicitly leave. (Even if it pauses/resumes for a hidden tab.)
    this.session = synchronizer.session;
    synchronizer.attach(this);
    const blockAssembly = this,
	  modelAssembly = synchronizer.croquetModel;
    blockAssembly.forEachChild((block, name) => block.integrate(new Synchronizer(modelAssembly.getChild(name))));
    return this;
  }
  disintegrate() { // Sever connection from a previously integrated Synchronizer. Called only by it's detach().
    //console.log('block distintegrate', this.name);
    this.synchronizer = this;
  }
  get isSessionRoot() {
    /*
    if (this.session.block === this) {
      console.log('*** need truth, online:', this.isOnline,
		  'matching sessions:', this.synchronizer.session === this.session,
		  'matching session model:', this.synchronizer.session?.model === this.synchronizer.croquetModel);
    } else {
      console.log('*** need false, online:', this.isOnline);
    }*/
    //return this.synchronizer.isSessionRoot;
    return this.session.block === this;
  }
}
class BlockBookkeeping extends BlockSession { // Define the operations required by BookkeepingAssembly.
  constructor(spec) {
    super(spec);
    this.id = this; // Until we know better.
    this.template = this.constructor.createModel(spec);
  }
  get root() { // Not this.session.block because we might not have a session, and their might be multiple sessions in the tree.
    return this.parent?.root || this;
  }
  get path() {
    return this._path || (this._path = `${this.parent?.path || ''}${this.name || ''}/`);
  }
  changeParent(parent, name = this.name) { // Let the template/model know about parent.
    super.changeParent(parent, name);
    this.updateTemplate('parent', parent?.template || null); // Explicitly null if no parent.
  }
  integrate(synchronizer) {
    const value = super.integrate(synchronizer);
    this.id = synchronizer.croquetModel.id; // Cache here, so that we can record changes to this Block when offline.
    // It is not kept globally because the same Javascript can have two instances of the same session (e.g., in test suites)
    // and these must have different blocks for the same session-based block id.
    const blocks = this.session.blocks || (this.session.blocks = {});
    blocks[this.id] = this;
    return value;
  }
  destroy() {
    super.destroy();
    const blocks = this.session?.blocks;
    if (!blocks) return;
    delete blocks[this.id]; // Not on disintegrate, as we may resume or join, and re-integrate later.
  }
  find(pathId) { // We accept either a Croquet model id, or a path of child names.
    const node = this.session?.blocks[pathId]; // Maybe we should keep in root instead of nullable session? Or maybe not do id?
    if (node) return node;
    if ((pathId.length > 1) && pathId.endsWith('/')) pathId = pathId.slice(0, -1);
    return this.getNodeByNames(pathId.split('/'));
  }
  getNodeByNames(names) { // Goes as far down the path as it can. Empty name is root.
    if (!names.length) return this;
    const name = names[0],
	  child = name ? this.getChild(name) : this.root;
    if (child) return child.getNodeByNames(names.slice(1));
    return this;
  }
  create(name, spec) {
    let child = new this.constructor(spec),
	croquetModel = this.synchronizer.croquetModel;
    if (croquetModel) child.integrate(new Synchronizer(croquetModel.getChild(name)));
    return child;
  }
  updateTemplate(key, value) {
    this.template[key] = value;
  }

  // Type expansion used by create:
  static types = {Object};
  static createModel({type, ...properties}) {
    if (!type) return properties; // Just a POJO, copied.
    let constructor = this.types[type];
    return new constructor(properties);
    }
  static register(type) { // Make a model type known.
    this.types[type.name] = type;
  }
}
class BlockRecording extends BlockBookkeeping {
  // FIXME: How much of this could be done as actions on blocks?
  static offlineRecorder(block, key, value) { // The recorder.
    // FIXME: can't really be static/global. What about having several block trees in different sessions, all coming online at once?
    Block.offlineRecording.push({id: block.synchronizer.id, path: block.path, key, value});
  }
  static offlineRecording = []; // The result.
  get offlineRecorder() {
    return BlockRecording.offlineRecorder;
  }
  resetOfflineRecorder() {
    let recording = BlockRecording.offlineRecording;
    BlockRecording.offlineRecording = [];
    this.removeRecorder1(this.offlineRecorder);
    return recording;
  }
  capture(key, value) {
    this.recorders.forEach(recorder => recorder(this, key, value));
  }
  resolve(id, path) { // Find (or create) object in the current session.
    let block = this.find(id);
    // An id that still exists in the model. There's no question that this is the same object, so in this case we're good to go.
    if (block) return block;
    block = this.find(path);
    // Something new exists at that path. Let's use that.
    // TODO: When we have author info, it might be nice to see if it was created by us, and if not, make another one in parallel.
    if (block?.path === path) return block;
    // FIXME: make what is needed. Create whatever parts do not already exist.
  }
  replay(recording) {
    recording.forEach(({id, path, key, value}) => {
      id = this.resolve(id, path).id;
      this.synchronizer.publish(id, 'setSpecProperty', {key, value});
    });
  }
  async join(croquetOptions) {
    const recording = this.resetOfflineRecorder(),
	  newBlock = await super.join(croquetOptions);
    setTimeout(_ => newBlock.replay(recording), 100); // fixme. Let this be done by synchronized constructor? How would it get old block's recordings?
    return newBlock;
  }

  // Much of this is just maintaining this.records.
  // It would be easier with part-whole inheritance and dependency-directed backtracking, which is used elsewhere in Ki1r0y.
  // But since the need is so narrow, we do without here and manage it manually. At least it's a nice example of why such things are good.
  constructor(...rest) {
    super(...rest);
    this.recorders = []; //fixme remove this.offlineRecorder]; // Debatable. For now, we start off recording, but it is soon removed by integrate().
  }
  integrate(...rest) {
    this.removeRecorder1(this.offlineRecorder);
    return super.integrate(...rest);
  }
  disintegrate() {
    if (this.isSessionRoot) this.addRecorder(this.offlineRecorder); // All Synchronizers are offline - start recording.
    super.disintegrate();
  }
  create(...rest) {
    const child = super.create(...rest);
    child.recorders = this.recorders.slice();
    return child;
  }
  destroy() {
    super.destroy();
    this.recorders = null;
  }
  addRecorder1(recorder) {
    this.recorders.push(recorder);
  }
  removeRecorder1(recorder) {
    this.recorders.splice(this.recorders.indexOf(recorder), 1);
  }
  addRecorder(recorder) {
    this.addRecorder1(recorder)
    this.forEachChild(child => child.addRecorder(recorder));
  }
  removeRecorder(recorder) {
    this.removeRecorder1(recorder);
    this.forEachChild(child => child.removeRecorder(recorder));
  }
}

export class Block extends BlockRecording {
  constructor(spec) {
    super(spec);
    this.spec = spec;
    const self = this;
    this.model = new Proxy(this.template, { // This is what it's all about!
      set(target, key, value) {
	self.synchronizer.setProperty(key, value); // Might or might not reflect, depending on synchronizer.
	self.capture(key, value);                  // Might or might not do anything, depending on recorders.
	return true; // Required for setter traps.
      },
      // Model does not itself contain proxies, because then internal model-to-model assignments would trigger a publishing storm.
      get(target, key, receiver) { // If the reference is to a child, answer its proxy.
	// FIXME? Shold we also get model proxy for key === 'parent'?
	return self.getChild(key)?.model || target[key];
      }
    });

    for (let key in spec) this.setTemplateProperty(key, spec[key]); // Set up any initial children.

    if (this.template.display) { // FIXME: inheritance, generalize to multiple views and behaviors, views are blocks, etc.
      const constructor = this.constructor.types[this.template.display];
      this.display = new constructor(this);
    }
  }
  destroy() {
    const display = this.display;
    if (display) {
      //console.log('destroy', this.name, this, display);
      // fixme pick one:
      //display.remove(); // fixme generalize. Maybe in remove child or updateTemplate?
      //display.destroy(); // when display is a block
      display.parent = null; // when display is model
      //console.log(this.name, 'in destroy, display parent set to null', this); 

      this.display = null;
    }
    super.destroy();
    this.spec = this.model = null;
  }
}
Block.Croquet = Croquet; // So test code can tell if Croquet.fake is true.
