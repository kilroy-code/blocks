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
  destroy() {
    console.log('FIXME detroyed');
    super.destroy();
  }
}

class Synchronizer extends Croquet.View {
  detach() {
    console.log('FIXME detach');
    super.detach();
  }
  constructor(croquetModel) { // fixme: let's make this spec => this.spec and screw the proxy.
    super(croquetModel);
    this._croquetModel = croquetModel;
    this._outstanding = 0; // fixme: get rid of the underscores
    this._ready = null;
    this.spec = new Proxy(croquetModel.spec, {
      set() {
	throw new Error("The block spec is not writeable.");
      }
    });
  }
  integrate(block) { // Sets up this.model based on this.spec.
    const croquetModel = this._croquetModel,
	  synchronizer = this,
	  blockModel = block.model,
	  spec = block.spec = croquetModel.spec,
	  id = croquetModel.id,
	  setBlockModelProperty = ({key, value, from}) => {
	    blockModel[key] = value;
	    if (from !== synchronizer.viewId) return;
	    if (--synchronizer._outstanding) return;
	    synchronizer._readyResolve();
	    synchronizer._ready = null;
	  };
    if (this.model) this.unsubscribe(id, 'setBlockModelProperty');
    this.subscribe(id, 'setBlockModelProperty', setBlockModelProperty);
    block.model = new Proxy(blockModel, {
      set(target, key, value) { // Assignments to model proxy are reflected through Croquet.
	++synchronizer._outstanding;
	synchronizer.publish(id, 'setSpecProperty', {key, value, from: synchronizer.viewId});
	return true;
      }
    });
    for (let key in spec) { // Initialize rule model properties from Croquet.
      setBlockModelProperty({key, value: spec[key]}); // No 'from'.
    }
  }
  get ready() {
    if (this._ready) return this._ready;
    return this._ready = new Promise(resolve => this._readyResolve = resolve);
  }
}

// FIXME: devide Synchronizer into those used for child blocks and those for the root/place blocks. Some references (e.g., ready) must then be not to session, but must find our particular child-synchronizer.
export class Block {
  constructor(model) {
    this.model = model;
  }
  static async initialize(croquetOptions) { // FIXME: Just for test compatability. Remove it.
    const block = new this({}),
	  session = await block.join(croquetOptions);
    session.block = block;
    return session;
  }
  async join(croquetOptions) { // Join the specified Croquet session, interating our model.
    await this.leave();
    const options = Object.assign({model: Spec, view: Synchronizer}, croquetOptions),
	  session = this.session = await Croquet.Session.join(options);
    session.view.integrate(this);
    return session;
  }
  get ready() {
    return this.session && this.session.view.ready;
  }
  async leave() { // Leave the current synchronizing session, if any.
    if (!this.session) return;
    await this.session.leave();
    this.model = this.session.blockModel; // Restore the naked, assignable model.
    this.session = null;
  }
}

Spec.register("Spec");
