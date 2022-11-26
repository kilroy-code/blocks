import { Croquet } from "./croquet.mjs";
import { BookkeepingAssembly } from "./bookkeeping.mjs";

// Applications don't see these. Internally, their job is to generically hold all the non-default state of the application.
// A Croquet.Model runs locally, but in a way that stays bit-identical for each participant.
// It has no references at all to the model, block, or synchronizer - just a tree assembly of its own kind, and spec POJO.
export class CroquetModel extends BookkeepingAssembly(Croquet.Model) {

  // The principle API. Published by the corresponding Synchronizer object.
  setSpecProperty({key, value, from}) {
    // When any user tells the replicated CroquetModel to do this, each will setProperty and reflect to the local view.
    this.setTemplateProperty(key, value);
    this.publish(this.id, 'setModelProperty', {key, value, from, model: this});
  }

  init(spec) {
    // Croquet MAY call init with the session options and all messages since,
    // OR it may unpickle a snapshot and play messages since that snapshot.
    super.init();
    this.spec = spec;
    this.subscribe(this.id, 'setSpecProperty', this.setSpecProperty);
    // Create CroquetModel children as needed. No need to publish (setSpecProperty) because either
    // we were created from an initial spec, and the Synchronizer (Croquet.View) will be created next and explicitly review our children,
    // or we were dynamically created from setSpecProperty which is about to publish.
    for (let key in spec) this.setTemplateProperty(key, spec[key]);
  }

  // The remaining are expected by BookkeepingAssembly.
  // Note that BookkeepingAssembly within our Croquet.Model and our Croquet.View, which each have different mechanisms and names.
  // So some of this is just adapting the names.

  find(modelIdentifier) { // Answer the CroquetModel associated with this croquet model identifier.
    return this.getModel(modelIdentifier); // getModel is defined on Croquet.Model
  }
  create(name, spec) {
    // We don't use name, but BookkeepingAssembly sets it later.
    return this.constructor.create(spec);
  }
  destroy() { // Remove from snapshot. Never called on root.
    super.destroy();
    this.spec = null;
  }
  get template() {
    return this.spec;
  }
  updateTemplate(key, value) {
    if (value === undefined) {   // Setting spec[key]=undefined is not the same as deleting spec[key].
      delete this.template[key]; // Spec should be just the non-default values, so should not contain undefined values.
      // Note that we don't compare with a default rule. Once a property has been explicitly set, it doesn't
      // go away until explicitly reset (set to undefined).
      return;
    }
    this.template[key] = value;
  }
}
CroquetModel.register("CroquetModel");
