import { Croquet } from "./croquet.mjs";
import { Block } from "./block.mjs";

function makeResolvablePromise() { // Return a Promise that has resolve() method that can be called later.
  let cleanup, promise = new Promise(resolve => cleanup = resolve);
  promise.resolve = cleanup;
  return promise;
}

export class Synchronizer extends Croquet.View {
  // Controls communication between the block model and the Croquet session. While the session is running:
  //   this.nakedBlockModel preserves the underlying block model so that the session can restore it in the block when the session detaches.
  //   block.model is a proxy that intercepts assignments and reflects through Croquet.
  //   block.session is the Croquet session, so that we know how to leave().
  // If we go offline (or suspended), these are reverted.
  constructor(croquetSpec) {
    super(croquetSpec);
    this.croquetSpec = croquetSpec;
    // It isn't documented, but Croquet.View constructor sets session. However, it nulls it before detach() is called, which needs it to find our block.
    this.cachedSession = this.session;
    this.outstanding = 0;
    this.readyPromise = this.parent = null;
    this.children = {};
    const children = croquetSpec.children;
    for (let name in children) {
      const child = this.children[name] = new this.constructor(children[name]);
      child.parent = this;
      child.name = name;
    }
    this.subscribe(croquetSpec.id, 'setModelProperty', this.setModelProperty);
    this.integrate(this.block);
  }
  detach() { // Called when our session ends by explicit leave or suspended by tab being hidden, or when a child is removed from the model.
    // In the latter cases, there is no local block action, so handle block cleanup here.
    const block = this.block;
    if (block) {
      block.remove();
      block.model = this.nakedBlockModel; // Restore the naked, assignable model.
      block.session = block.synchronizer = null;
    }

    // Clean up us and our children from parents.
    const {parent, name, children} = this;
    if (parent) delete parent.children[name];
    for (let name in children) children[name].detach();

    // I don't yet know if we should clear this.cachedSession/this.block or whether we'll want to identify the block for a detched view.
    this.cachedSession = this.block = undefined;

    this.nakedBlockModel = this.children = this.parent = this.name = null;
    super.detach(); // Unsubscribes all.
    this.resolveReady() // Just in case someone's waiting.
  }
  integrate() { // Sets up block.model based on this.spec.
    const croquetSpec = this.croquetSpec,
	spec = croquetSpec.spec,
	nakedBlockModel = this.nakedBlockModel = Block.createModel(spec),
	block = new Block(nakedBlockModel);
    const synchronizer = block.synchronizer = this, // Being clear about reference within proxy definition below.
	  session = this.cachedSession, // Only valid when not detached. Can't integrate a detached Synchronizer.
	  id = croquetSpec.id;
    block.session = session;
    block.spec = spec;
    this.block = block;
    block.model = new Proxy(nakedBlockModel, {
      set(target, key, value, receiver) { // Assignments to model proxy are reflected through Croquet.
	++synchronizer.outstanding;
	synchronizer.publish(id, 'setSpecProperty', {key, value, from: synchronizer.viewId});
	return true;
	}
    });
  }
  setModelProperty({key, value, from}) { // Maintain a model property, and resolveReady if needed.
    this.nakedBlockModel[key] = value;
    if ((value === undefined) && this.parent) this.detach();
    if (from !== this.viewId) return; // Only count down our own assignments.
    // Subtle: It ought to be ok to just do:
    //   if (--this.outstanding) return;
    // But that fails in the unusual case of two identical session instances running in the same browser tab (e.g., in a test suite).
    // Such behavior isn't currently supported by Croquet, and so each session instance executes each view->model messages
    // rather than just the one that was sent by the reflector to that particular session instance.
    // We can't really fix that from here, but the result in this case is that each session instance receives twice as
    // many calls to this method as we should. This works around that, ASSUMING that one waits for all messages to be
    // received by all session instances. (Which is a big assumption!)
    if (--this.outstanding > 0) return;
    if (this.outstanding < 0) this.outstanding = 0;

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
  /* See comment for this.block = undefined, above.
  // We don't store the block here, because after revealing a hidden tab, the Croquet session will restart with a NEW Croquet.view
  // (which will not have the block attached), and we will need to find that block in order to re-integrate.
  // The croquetSpec.id is the same when the same session is re-awakened. (this.id gets a differrent /Vn suffix.)
  get block() {
    const blocks = this.cachedSession?.blocks;
    return blocks && blocks[this.croquetSpec.id];
  }
  set block(block) {
    let blocks = this.cachedSession.blocks;
    if (!blocks) blocks = this.cachedSession.blocks = {};
    if (block) {
      blocks[this.croquetSpec.id] = block;
    } else {
      delete blocks[this.croquetSpec.id];
    }
  }
  */
}
