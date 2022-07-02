//import { Croquet } from '../croquet-in-memory/index.mjs';

class Spec extends Croquet.Model {
  // Applications don't see these. Internally, their job is to generically hold all the non-default state of the application.
  init(properties) {
    super.init(properties);
    this.spec = {};  // But they do see (a read-only proxy to) this, which holds the state.
    // TODO: expend children
    this.subscribe(this.id, 'setSpecProperty', this.setSpecProperty);
  }
  setSpecProperty({key, value, from}) { // Update our spec, and reflect to the block model.
    if (value === undefined) delete this.spec[key];
    else this.spec[key] = value;
    this.publish(this.id, 'setBlockModelProperty', {key, value, from}); // And regardless, forward to block.
  }
}

class Synchronizer extends Croquet.View {
  constructor(model) {
    super(model);
    this.model = model;
    this.outstanding = 0;
    this._ready = null;
    // It isn't documented, but Croquet.View constructor sets session. However, it nulls it before detach() is called.
    this.originalSession = this.session;
    this.subscribe(model.id, 'setBlockModelProperty', this.setBlockModelProperty);
    console.log('created view', this.id, this.session.block); window.view = this, window.session = this.session;
    if (this.session.block) this.integrate(this.session.block);
  }
  detach() {
    const block = this.originalSession.block,
	  blockModel = this.blockModel;
    super.detach();
    if (!block) return;
    if (this._ready) this._ready.resolve();
    this._ready = block.session = null;
    block.model = blockModel; // Restore the naked, assignable model.
  }
  integrate(block) { // Sets up block.model based on this.spec.
    const synchronizer = this,
	  blockModel = this.blockModel = block.model,
	  model = this.model,
	  spec = block.spec = model.spec,
	  id = model.id;
    console.log('integrate', blockModel, spec, id);
    block.model = new Proxy(blockModel, {
      set(target, key, value) { // Assignments to model proxy are reflected through Croquet.
	++synchronizer.outstanding;
	synchronizer.publish(id, 'setSpecProperty', {key, value, from: synchronizer.viewId});
	return true;
      }
    });
    for (let key in spec) { // Initialize rule model properties from Croquet.
      this.setBlockModelProperty({key, value: spec[key]}); // No 'from'.
    }
    block.session = this.session;
  }
  setBlockModelProperty({key, value, from}) {
    this.blockModel[key] = value;
    if (from !== this.viewId) return;
    console.log('setBlockModelProperty', this.outstanding, this._readyResolve);
    if (--this.outstanding) return;
    this._ready.resolve();
    this._ready = null;
  }
  get ready() {
    if (this._ready) return this._ready;
    let resolver,
	promise = new Promise(resolve => resolver = resolve);
    promise.resolve = resolver;
    return this._ready = promise;
  }
}

// FIXME: devide Synchronizer into those used for child blocks and those for the root/place blocks.
//     Some references (e.g., through session.view) must then find our particular child-synchronizer.
export class Block {
  constructor(model) {
    this.model = model;
  }
  static async fromSession(croquetOptions) {
    const block = new this({}),
	  session = await block.join(croquetOptions);
    //session.block = block;
    return block;
  }
  async join(croquetOptions, specToMerge = null) { // Join the specified Croquet session, interating our model.
    await this.leave();
    const options = Object.assign({model: Spec, view: Synchronizer}, croquetOptions),
	  session = this.session = await Croquet.Session.join(options);
    session.block = this;
    session.view.integrate(this, specToMerge);
    if (!specToMerge) return session;
    // TODO: arrange at least an automerge (including children).
    for (let key in specToMerge) {
      this.model[key] = specToMerge[key];
    }
    await this.ready;
    return session;
  }
  get ready() { // If there is a session, answer a promise that resolves when all our traffic to our view has been reflected.
    return this.session && this.session.view.ready;
  }
  async leave() { // Leave the current synchronizing session, if any.
    if (!this.session) return;
    await this.session.leave();
  }
}

Spec.register("Spec");
