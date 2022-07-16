import { Croquet } from "./croquet.mjs";
import { Spec } from "./spec.mjs";
import { Synchronizer } from "./synchronizer.mjs";

// A Block always has a model, and has a session IFF it is online.
export class Block {
  constructor(model) {
    console.log('construct block', this, model.display ? "adding display" : "no display");
    this.model = model;
    this.fixme();
  }
  fixme() {
    const {model} = this;
    if (model.display) { // FIXME: inheritance, generalize to multiple views and behaviors, views are blocks, etc.
      const constructor = this.constructor.types[model.display];
      this.display = new constructor(this);
    }
  }
  remove() {
    console.log('remove block', this);
    if (this.synchronizer) {
      this.synchronizer.block = undefined;
    }
    this.display?.remove(); // fixme: generalize
    this.display = null;
  }
  async join(croquetOptions) { // Join the specified Croquet session, interating our model.
    await this.leave();
    const session = this.session = await this.constructor.join(croquetOptions);
    session.view.integrate(this); // Integrate us into the session's root view.
    return session;
  }
  static async join(croquetOptions) {
    const options = Object.assign({model: Spec, view: Synchronizer}, croquetOptions),
	  session = await Croquet.Session.join(options);
    return session;
  }
  async leave() { // Leave the current synchronizing session, if any.
    const session = this.session;
    if (!session) return;
    await session.leave();
    delete session.blocks; // Individual block.session is cleared when its view detaches. Release session.blocks only after leaving.
  }
  get ready() { // If there is a session, answer a promise that resolves when all our traffic to our view has been reflected.
    return this.synchronizer && this.synchronizer.ready;
  }
  static createModel({type, ...properties}) {
    let constructor = this.types[type];
	// FIXME?? Should rules be dynamically created for each property? Here or in the base type for models?
	// FIXME: How should childspecs be handled within properties?
	// FIXME: How should top-level block get it's rules?
    return new constructor(properties);
  }
  static create(properties) {
    let model = this.createModel(properties);
    return new Block(model);
  }
  static register(type) {
    this.types[type.name] = type;
  }
}
Block.types = {};
Block.Croquet = Croquet; // So test code can tell if Croquet.fake is true.

