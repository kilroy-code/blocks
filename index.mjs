import { Croquet } from "./croquet.mjs";
import { Spec } from "./spec.mjs";
import { Synchronizer } from "./synchronizer.mjs";

// A Block always has a model, and has a session IFF it is online.
export class Block {
  constructor(model) {
    this.model = model;
  }
  async join(croquetOptions) { // Join the specified Croquet session, interating our model.
    await this.leave();
    const options = Object.assign({model: Spec, view: Synchronizer}, croquetOptions),
	  session = this.session = await Croquet.Session.join(options);
    session.blocks = {};
    session.view.integrate(this); // Integrate us into the session's root view.
    return session;
  }
  async leave() { // Leave the current synchronizing session, if any.
    const session = this.session;
    if (!session) return;
    await session.leave();
    delete session.blocks;
  }
  get ready() { // If there is a session, answer a promise that resolves when all our traffic to our view has been reflected.
    return this.synchronizer && this.synchronizer.ready;
  }
}
Block.Croquet = Croquet; // So test code can tell if Croquet.fake is true.
