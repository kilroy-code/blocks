//import { Croquet } from '../croquet-in-memory/index.mjs';

function makeResolvablePromise() { // Return a Promise that stores it's resolve() as a property on itself.
  let cleanup, promise = new Promise(resolve => cleanup = resolve);
  promise.resolve = cleanup;
  return promise;
}

// Applications don't see these. Internally, their job is to generically hold all the non-default state of the application.
class Spec extends Croquet.Model {
  init(properties) {
    super.init(properties);
    this.spec = {};  // A clean set of all & only the properties (no Croquet machinery) that can be read by the application.
    // TODO: expand children (Spec and Synchronizer) within the same session.
    this.subscribe(this.id, 'setSpecProperty', this.setSpecProperty);
  }
  setSpecProperty({key, value, from}) { // Update our spec, and reflect to the naked block model.
    if (value === undefined) delete this.spec[key];
    else this.spec[key] = value;
    this.publish(this.id, 'setModelProperty', {key, value, from});
  }
}
Spec.register("Spec");

class Synchronizer extends Croquet.View {
  // Controls communication between the block model and the Croquet session. While the session is running:
  //   this.nakedBlockModel preserves the underlying block model so that the session can restore it in the block when the session detaches.
  //   block.model is a proxy that intercepts assignments and reflects through Croquet.
  //   block.session is the Croquet session, so that we know how to leave().
  // If we go offline (or suspended), these are null.
  constructor(croquetSpec) {
    super(croquetSpec);
    this.croquetSpec = croquetSpec;
    this.outstanding = 0;
    this.readyPromise = null;
    // It isn't documented, but Croquet.View constructor sets session. However, it nulls it before detach() is called.
    this.cachedSession = this.session;
    this.subscribe(croquetSpec.id, 'setModelProperty', this.setModelProperty);
    // If this is new from a Croquet session restart (after reavealing a hidden tab), reintegrate the existing block.
    if (this.session.rootBlock) this.integrate(this.session.rootBlock); // FIXME: only if we are a root Synchronizer.
  }
  detach() { // Called when our session ends by explicit leave or tab hidden.
    // We do NOT clear this.cachedSession.rootBlock, because the session may be restarted and we'll need to know what to integrate.
    const rootBlock = this.cachedSession.rootBlock;

    // FIXME: detach child Synchronizers, restoring their model
    rootBlock.model = this.nakedBlockModel; // Restore the naked, assignable model.

    super.detach(); // Unsubscribes all.
    rootBlock.session = this.cachedSession = this.nakedBlockModel = null;
    this.resolveReady() // Just in case someone's waiting.
  }
  integrate(block) { // Sets up block.model based on this.spec.
    const synchronizer = this, // Being clear about reference within proxy definition below.
	  session = this.cachedSession, // Only valid when not detached. Can't integrate a detached Synchronizer.
	  nakedBlockModel = this.nakedBlockModel = block.model,
	  croquetSpec = this.croquetSpec,
	  spec = block.spec = croquetSpec.spec,
	  id = croquetSpec.id;
    block.session = session;
    session.rootBlock = block;
    block.model = new Proxy(nakedBlockModel, {
      set(target, key, value) { // Assignments to model proxy are reflected through Croquet.
	++synchronizer.outstanding;
	synchronizer.publish(id, 'setSpecProperty', {key, value, from: synchronizer.viewId});
	return true;
      }
    });
    for (let key in spec) { // Initialize rule model properties from Croquet.
      // FIXME: somewhere, ensure that the child Blocks, Specs, and Synchronizers all match.
      // But what drives it? Maybe block drive spec which then creates synchronizers.
      this.setModelProperty({key, value: spec[key]}); // No 'from'.
    }
  }
  setModelProperty({key, value, from}) { // Maintain a model property, and resolveReady if needed.
    this.nakedBlockModel[key] = value;
    if (from !== this.viewId) return; // Only count down our own assignments.
    if (--this.outstanding) return;
    this.resolveReady();
  }
  resolveReady() { // Resolve readyPromise, if any.
    if (!this.readyPromise) return;
    this.readyPromise.resolve();
    this.readyPromise = null;
  }
  get ready() { // A promise that resolves when there are no longer any outstanding assignments.
    if (this.readyPromise) return this.readyPromise;
    return this.readyPromise = makeResolvablePromise();
  }
  // FIXME: root Synchronizer keeps a map of Block => Synchronizer (and each Synchronizer keeps the corresponding Block)
  getSynchronizer(block) {
    return this.synchronizers.get(block);
  }
  setSynchronizer(block, synchronizer) {
    return this.synchronizers.set(block, synchronizer);
  }
}

// A Block always has a model, and has a session IFF it is online.
export class Block {
  constructor(model) {
    this.model = model;
  }
  static async fromSession(croquetOptions) {
    const block = new this({});
    await block.join(croquetOptions);
    return block;
  }
  async join(croquetOptions, specToMerge = null) { // Join the specified Croquet session, interating our model.
    await this.leave();
    const options = Object.assign({model: Spec, view: Synchronizer}, croquetOptions),
	  session = this.session = await Croquet.Session.join(options);
    session.view.integrate(this, specToMerge); // Integrate us into the session's root view.
    if (!specToMerge) return session;
    // TODO: arrange at least an automerge (including children).
    for (let key in specToMerge) {
      this.model[key] = specToMerge[key];
    }
    await this.ready;
    return session;
  }
  async leave() { // Leave the current synchronizing session, if any.
    if (!this.session) return;
    await this.session.leave();
  }
  get ready() { // If there is a session, answer a promise that resolves when all our traffic to our view has been reflected.
    return this.session && this.session.view.ready; // FIXME: get view for this block, not just the root view of session.
  }
}
