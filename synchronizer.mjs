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

    // I don't yet know if we should clear this.cachedSession/this.block or whether we'll want to identify the block for a detched view.
    // We certainly don't want to do so for the root Synchronizer, so that any application-cached root block is reused with new online info.
    // But should we also reuse the others? Maybe only free these up when we leave()?
    if (this.parent) {
      this.cachedSession = this.block = undefined;
    }

    // Clean up us and our children from parents.
    const {parent, name, children} = this;
    if (parent) delete parent.children[name];
    for (let name in children) children[name].detach();

    this.nakedBlockModel = this.children = this.parent = this.name = null;
    super.detach(); // Unsubscribes all.
    this.resolveReady() // Just in case someone's waiting.
  }
  integrate() { // Sets up block.model based on this.spec.
    const croquetSpec = this.croquetSpec,
	  spec = croquetSpec.spec,
	  session = this.cachedSession, // Only valid when not detached. Can't integrate a detached Synchronizer.
	  id = croquetSpec.id;

    let block = this.block, nakedBlockModel = block?.model;
    if (!block) {
      nakedBlockModel = Block.createModel(spec);
      block = new Block(nakedBlockModel);
    }
    this.nakedBlockModel = nakedBlockModel;
    const synchronizer = block.synchronizer = this; // Being clear about reference within proxy definition below.

    block.session = session;
    block.spec = spec;
    this.block = block;
    for (let name in this.children) {
      nakedBlockModel[name] = this.children[name].block.model; // Children are created first, so child.model is a Proxy.
    }
    block.model = new Proxy(nakedBlockModel, {
      set(target, key, value, receiver) { // Assignments to model proxy are reflected through Croquet.
	++synchronizer.outstanding;
	synchronizer.publish(id, 'setSpecProperty', {key, value, from: synchronizer.viewId});
	return true;
	}
    });
  }
  setModelProperty({key, value, from, spec}) { // Maintain a model property, and resolveReady if needed.

    // In July 2022, Croquet.OS does not support running two session sessions in the same browser. But we do that in our test suites.
    // The specific problem in current Croquet.OS is that view subscriptions are global. E.g., someone publishes setSpecProperty,
    // the models in N session instances receive and publish setModelPropery, and each of the N session instances executes N setModelProperty
    // events instead of just 1. This is no problem when N=1 session per browser, but during unit testing with N>1, this throws off
    // this.outstanding, because we increment once, and decrement N times. We work around that by having setModelProperty pass the Spec
    // that published it, and here we simply ignore any that are not from our Spec.
    if (spec !== this.croquetSpec) return;

    this.nakedBlockModel[key] = value;
    if ((value === undefined) && this.parent) this.detach();
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
  ///* See comment for this.block = undefined, above.
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
  //*/
}
