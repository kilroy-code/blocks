import { Croquet } from "./croquet.mjs";

function makeResolvablePromise() { // Return a Promise that stores it's resolve() as a property on itself.
  let cleanup, promise = new Promise(resolve => cleanup = resolve);
  promise.resolve = cleanup;
  return promise;
}

export class Synchronizer extends Croquet.View {
  // Controls communication between the block model and the Croquet session. While the session is running:
  //   this.nakedBlockModel preserves the underlying block model so that the session can restore it in the block when the session detaches.
  //   block.model is a proxy that intercepts assignments and reflects through Croquet.
  //   block.session is the Croquet session, so that we know how to leave().
  // If we go offline (or suspended), these are null.
  constructor(croquetSpec) {
    super(croquetSpec);
    this.croquetSpec = croquetSpec;
    // It isn't documented, but Croquet.View constructor sets session. However, it nulls it before detach() is called.
    this.cachedSession = this.session;
    this.outstanding = 0;
    this.readyPromise = null;
    this.subscribe(croquetSpec.id, 'setModelProperty', this.setModelProperty);
    if (this.block) this.integrate(this.block);
  }
  detach() { // Called when our session ends by explicit leave or tab hidden.
    const block = this.block;

    // FIXME: detach child Synchronizers, restoring their model
    block.model = this.nakedBlockModel; // Restore the naked, assignable model.

    super.detach(); // Unsubscribes all.
    // We do NOT clear this.cachedSession/this.block because the session may be restarted and we'll need to know what to integrate.
    block.session = block.synchronizer = this.nakedBlockModel = null;
    this.resolveReady() // Just in case someone's waiting.
  }
  // We don't store the block here, because after revealing a hidden tab, the Croquet session will restart with a NEW Croquet.view
  // (which will not have the block attached), and we will need to find that block in order to re-integrate.
  // The view.id is the same when the same session is re-awakend.
  get block() {
    const blocks = this.cachedSession?.blocks;
    return blocks && blocks[this.croquetSpec.id];
  }
  set block(block) {
    this.cachedSession.blocks[this.croquetSpec.id] = block;
  }
  integrate(block) { // Sets up block.model based on this.spec.
    //   Bookkeeping:
    // 1. this.nakedBlockModel = block.model - so that this.detach() can unwrap the proxy.
    //    Populate it from current this.croqetSpec.spec, including children.
    // 2. this.cachedSession.??? adds block (or model) <--> this for use in ???
    //   For clients of block:
    // 3. block.model = Proxy(this.nakedBlockModel) - so assignments to block are replicated.
    // 4. block.spec = this.croquetSpec.spec - so clients can always see the side-effected replicated spec
    // 5. block.synchronizer = this - so clients can leave
    const synchronizer = block.synchronizer = this, // Being clear about reference within proxy definition below.
	  session = this.cachedSession, // Only valid when not detached. Can't integrate a detached Synchronizer.
	  nakedBlockModel = this.nakedBlockModel = block.model,
	  croquetSpec = this.croquetSpec,
	  spec = block.spec = croquetSpec.spec,
	  id = croquetSpec.id;
    block.session = session;
    this.block = block;
    block.model = new Proxy(nakedBlockModel, {
      set(target, key, value, receiver) { // Assignments to model proxy are reflected through Croquet.
	++synchronizer.outstanding;
	synchronizer.publish(id, 'setSpecProperty', {key, value, from: synchronizer.viewId});
	return true;
	}
    });
    for (let key in spec) { // Initialize rule model properties from Croquet.
      let value = spec[key];
      // FIXME: if value.type, expand.
      this.setModelProperty({key, value: value}); // No 'from'.
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
}
