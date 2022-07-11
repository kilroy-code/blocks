import { Croquet } from "./croquet.mjs";

// Applications don't see these. Internally, their job is to generically hold all the non-default state of the application.
export class Spec extends Croquet.Model {
  // Croquet MAY call init with the session options and all messages since, OR it may unpickle a snapshot and play messages since that.
  init(spec) {
    super.init();
    console.log('init Spec', this.id, spec);
    // spec and children are their own objects so that the namespace is independent of Spec instances.
    this.spec = spec;
    this.children = {};
    this.parent = null;
    this.subscribe(this.id, 'setSpecProperty', this.setSpecProperty);
    // FIXME: Understand exactly when init is called relative to new options. Should we drop the options/spec mechanism?
    for (let key in spec) this.addKey(key, spec[key]);
  }
  destroy() {
    console.log('destroy Spec', this.id);
    // Defensive programming: aSpec.destroy() must always clean up in parent.
    // TODO: This is never called by Croquet for the root node, even when explicitly leaving. It can't be called without a replicated event, and we
    // won't get our own leave until we return. How can we clean up?
    const {parent, name, children} = this;
    if (parent) {
      // FIXME: ??? parent.publish(parent.id, 'setSpecProperty', {key: name});
      delete parent.children[name];
      delete parent.spec[name];
    }
    for (let name in children) children[name].destroy();
    this.spec = this.children = this.parent = this.name = null;
    super.destroy();
    return true;
  }
  setSpecProperty({key, value, from}) { // Update our spec, and reflect to the naked block model.
    console.log('set spec', this.id, key, value, from);
    if (value === undefined) this.removeKey(key);
    else this.addKey(key, value);
    this.publish(this.id, 'setModelProperty', {key, value, from});
  }
  addKey(key, value) {
    if (!value.type) return this.spec[key] = value; // The assignment is sometimes a no-op.
    if (this.children[key]?.spec === value) return;
    const child = this.children[key] = this.constructor.create(value);
    child.name = key;
    child.parent = this;
  }
  removeKey(key) {
    // Destroy child if key names one (which will delete from spec), else just delete it from spec.
    this.children[key]?.destroy() || delete this.spec[key];
  }
}
Spec.register("Spec");
