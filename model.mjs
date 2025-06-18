import { Croquet } from '@kilroy-code/utilities/croquet.mjs';
import { SimpleAssembly } from './assembly.mjs';
export { Croquet };

export const Model = superclass => class extends SimpleAssembly(superclass) {
  init(spec) {
    super.init();
    this.name = 'none';
    this.fromSpec(spec);
    this.subscribe(this.id, 'setSpecProperty', this.setSpecProperty);
  }
  setSpecProperty({key, value, from}) {
    this.setProperty(key, value);
    this.publish(this.id, 'setTemplateProperty', {key, value, from, viewModel: this});
  }
  _spec = {};
  get spec() { // Without child specs or parent, but with name.
    // The lack of specs/children is because late arrivers must make their views/blocks from the existing
    // models (capturing the existing model in each corresponding view). So when populating the
    // corresponding blocks (from these specs), we don't want them to double the children.
    return Object.assign({name: this.name}, this._spec);
  }
  fromSpec(spec) { // Separate from init, so that it can be used from hash data.
    // And not initialize either, because name, parent, specs are magic. FIXME?
    //console.log(`fromSpec(${JSON.stringify(spec)})`);
    for (let key in spec) {
      this.setProperty(key, spec[key]);
    }
  }
  setProperty(key, value) {
    if (key === 'specs') return this.createSpecChildren(value);
    if (key === 'name') return this.name = value;
    if (key === 'parent') return this.parent = value ? this.getModel(value) : null;
    if (value === undefined) delete this._spec[key];
    else this._spec[key] = value;
  }
  createSpecChildren(specs) {
    for (let spec of specs) this.constructor.create(spec).parent = this;
  }
  _setParent(parent) {
    super._setParent(parent);
    if (!parent) this.destroy();
  }
  destroy() {
    //console.log(`Model ${this.name} destroy`);
    for (let child of this.children) child.destroy();
    super.destroy();
  }
};
export const CroquetModel = Model(Croquet.Model);;
CroquetModel.register("CroquetModel");
