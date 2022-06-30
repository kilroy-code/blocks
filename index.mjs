//import { Croquet } from '../croquet-in-memory/index.mjs';

class Spec extends Croquet.Model { // Applications don't see these.
  init(properties) {
    super.init(properties);
    this.spec = {};  // But they do see (a read-only proxy to) this.
    // TODO: expend children
    this.subscribe(this.id, 'setSpecProperty', this._setSpecProperty);
  }
  _setSpecProperty({key, value, from}) { // Update our spec, and reflect to the block model.
    if (value === undefined) delete this.spec[key];
    else this.spec[key] = value;
    this.publish(this.id, 'setBlockModelProperty', {key, value, from}); // And regardless, forward to block.
  }
}

export class Block extends Croquet.View {
  constructor(croquetModel) {
    super(croquetModel);
    const block = this,
	  blockModel = {},
	  spec = croquetModel.spec,
	  id = croquetModel.id,
	  setBlockModelProperty = ({key, value, from}) => {
	    blockModel[key] = value;
	    if (from !== block.viewId) return;
	    if (--block._outstanding) return;
	    block._readyResolve();
	    this._ready = null;
	  };
    this._outstanding = 0;
    this._ready = null;
    this.spec = new Proxy(spec,{
      set() {
	throw new Error("The block spec is not writeable.");
      }
    });
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
    this.subscribe(id, 'setBlockModelProperty', setBlockModelProperty);
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
