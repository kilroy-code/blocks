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

export class Block extends Croquet.View {
  detach() {
    console.log('FIXME detach');
    super.detach();
  }
  constructor(croquetModel) {
    console.log('making Block Croquet.View');
    super(croquetModel);
    this._croquetModel = croquetModel;
    this._outstanding = 0;
    this._ready = null;
    this.spec = new Proxy(croquetModel.spec, {
      set() {
	throw new Error("The block spec is not writeable.");
      }
    });
    this.initializeNewModel();
  }
  initializeNewModel(blockModel = {}) { // Sets up this.model based on this.spec.
    const block = this,
	  croquetModel = this._croquetModel,
	  spec = croquetModel.spec,
	  id = croquetModel.id,
	  setBlockModelProperty = ({key, value, from}) => {
	    blockModel[key] = value;
	    if (from !== block.viewId) return;
	    if (--block._outstanding) return;
	    block._readyResolve();
	    this._ready = null;
	  };
    if (this.model) this.unsubscribe(id, 'setBlockModelProperty');
    this.subscribe(id, 'setBlockModelProperty', setBlockModelProperty);
    this.model = new Proxy(blockModel, {
      set(target, key, value) { // Assignments to model proxy are reflected through Croquet.
	++block._outstanding;
	block.publish(id, 'setSpecProperty', {key, value, from: block.viewId});
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
  static async initialize(options) {
    const args = Object.assign({model: Spec, view: Block}, options),
	  session = await Croquet.Session.join(args);
    session.block = session.view;
    return session;
  }
}

Spec.register("Spec");
