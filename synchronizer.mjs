import { Croquet } from "./croquet.mjs";
import { BookkeepingAssembly } from "./bookkeeping.mjs";
import { Block } from "./block.mjs";

export function makeResolvablePromise() { // Return a Promise that has a resolve() method that can be called later.
  let capturedResolve,
      promise = new Promise((resolve) => {
	capturedResolve = resolve;
      });
  promise.resolve = capturedResolve;
  return promise;
}

// A Synchronizer is paired with a Block. It controls communication between the block model and the Croquet session.
// We split the Synchronizer into tiny subclasses just to make it easier to see how related things work.

class SynchronizerCroquet extends Croquet.View { // Maintains the Croquet.Model that corresponds to this Croquet.View
  constructor(croquetModel) {
    super(croquetModel);
    this.croquetModel = croquetModel;
  }
  detach() { // Explicitly called when the Croquet.View is destructed.
    super.detach();
    this.croquetModel = null;
  }
  get isSessionRoot() {
    // Croquet.View's session.model is a Croquet.model. It has nothing to do with block.model.
    return this.session.model === this.croquetModel;
  }
}
class SynchronizerLifecycle extends SynchronizerCroquet {
  // Manages our relationship with Blocks:
  // A Block can be created offline without a Synchronizer, but a Synchronizer cannot exist without a Block:
  //    Block#integrate(synchronizer) combines them, calling Synchronizer#attach(block).
  //    Block#disintegrate() breaks them appart, calling Synchronizer#detach();
  constructor(...rest) {
    super(...rest);
    if (this.isSessionRoot) Block.integrate(this);
  }
  attach(block) {
    this.block = block;
  }
  detach() {
    this.block.forEachChild(childBlock => childBlock.synchronizer.detach());
    super.detach();
    this.block.disintegrate(); // It is not our job to destroy blocks -- just sever the ties.
    this.block = null;
  }
}

// This is the main internal API used by Blocks to keep everything synchronized.
export class Synchronizer extends SynchronizerLifecycle {
  // Our block will call setProperty(), which goes through the reflector and comes back as setModelProperty().
  // We count the in-flight messages, and resolve our "ready" Promise when they return to zero.
  setProperty(key, value) { // Called by the Block.model proxy. Publishes through reflector.
    ++this.outstanding;
    this.publish(this.croquetModel.id, 'setSpecProperty', {key, value, from:this.viewId}); // See CroquetModel.
  }
  setModelProperty({key, value, from, model:croquetModel}) { // Maintain our template property (creating or destroying blocks), and resolveReady if needed.

    // At time of writing in July 2022, Croquet.OS does not support running two session sessions in the same browser. But we do that in our test suites.
    // The specific problem in current Croquet.OS is that view subscriptions are global. E.g., someone publishes setSpecProperty, and
    // the models in N session instances receive and publish setModelPropery, and then each of the N session instances executes N setModelProperty
    // view subscription events instead of just one. This is no problem when N=1 session per browser, but during unit testing with N>1, this throws off
    // this.outstanding, because we increment once, and decrement N times. We work around that by having setModelProperty pass the specific CroquetModel
    // that published it, and here we simply ignore any that are not from our CroquetModel. (setModelProperty is Croquet.Model to Croquet.View, so
    // it is not serialized on the wire and can thus take an instance parameter.)
    if (croquetModel !== this.croquetModel) return;

    this.block.setTemplateProperty(key, value); // Stores the data in the model, creating/destroying child blocks as needed.
    if (from !== this.viewId) return; // Only count down our own assignments.
    if (--this.outstanding) return;
    this.resolveReady();
  }
  constructor(croquetModel) {
    super(croquetModel);
    this.outstanding = 0;
    this.readyPromise = null;
    this.subscribe(croquetModel.id, 'setModelProperty', this.setModelProperty);
  }
  detach() {
    super.detach();
    this.resolveReady() // Just in case someone's waiting.
  }
  get ready() { // A promise that resolves when there are no longer any outstanding assignments on THIS block (not all blocks).
    if (this.readyPromise) return this.readyPromise;
    return this.readyPromise = makeResolvablePromise(); // Not yet resolved, regardless of what outstanding is before asking.
  }
  resolveReady() { // Internal. Resolve readyPromise, if any.
    if (!this.readyPromise) return;
    this.readyPromise.resolve();
    this.readyPromise = null;
  }
}
