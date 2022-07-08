import { Croquet } from "./croquet.mjs";

// Applications don't see these. Internally, their job is to generically hold all the non-default state of the application.
export class Spec extends Croquet.Model {
  init(spec = {}) {
    super.init(spec);
    this.spec = spec;  // A clean set of all & only the properties (no Croquet machinery) that can be read by the application.
    this.subscribe(this.id, 'setSpecProperty', this.setSpecProperty);
    // IF we are given a non-empty spec (e.g., block.join({... options: spec})), call Spec.create(childSpec) for each child spec.
    // FIXME: do it.
  }
  // FIXME: adding and removing/destroying a child node must add/remove its spec from ours.
  setSpecProperty({key, value, from}) { // Update our spec, and reflect to the naked block model.
    if (value === undefined) delete this.spec[key];
    else this.spec[key] = value;
    this.publish(this.id, 'setModelProperty', {key, value, from});
  }
}
Spec.register("Spec");
