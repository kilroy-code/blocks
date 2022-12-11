import { Rule } from '../rules/index.mjs';
import { CroquetModel, Croquet } from './model.mjs';
import { View } from './view.mjs';
import { Ruled } from './ruledAssembly.mjs';

export const Block = (superclass) => class extends superclass {
  static types = {'Ruled': Ruled};
  static register(kind, {name = kind.name, ...options} = {}) {
    // Rulify a subclass of RulifiedAssembly, and arrange to recognize the name string for use in createTemplate().
    Rule.rulify(kind.prototype, options);
    this.types[name] = kind;
  }
  static createTemplate({type = 'Ruled', ...spec}) { // Expand spec into specified subtype of RuledAssembly.
    const kind = this.types[type];
    return new kind().initialize(spec);
  }

  createTemplate(spec) { // Create and record template.
    let template = this._template = this.constructor.createTemplate(spec),
	// Cache block map because this.messenger.session will be nulled when we leave().
	templateBlocks = this.templateBlocks = this.messenger.sessionCachedBlocks;
    templateBlocks.set(template, this);
    return template;
  }
  getTemplateBlock(template) {
    return this.templateBlocks.get(template);
  }
  _template;

  constructor(...rest) {
    super(...rest);
    const self = this,
	  template = this.createTemplate(this.messenger.spec);
    this.messenger.integrateChildren();
    this.template = new Proxy(template, {
      set(target, key, value) { // Replicate assignements through the messenger.
	if (['children', 'block'].includes(key)) throw new Error(`Cannot set ${key}.`);
	self.messenger.setModelProperty(key, value);
	return true; // Required for setter traps.
      },
      get(target, key) { // If the reference is to a child, answer its proxy.
	const value = target[key];
	if (typeof(value) === 'function') { // This two-proxy dance is how one traps method calls.
	  return new Proxy(value, { // Make the call, but proxify the result.
	    apply(f, thisArg, argumentList) { return self.proxify(f.apply(thisArg, argumentList)); }});
	}
	if (key === 'children') return self.readOnlyProxyContainer(value);
	// While a naked template object should never have a reference to it's block, a proxy can!
	if (key === 'block') return self.getTemplateBlock(template);
	let proxified = self.proxify(value);
	return proxified;
      }
    });
  }
  proxify(value) { // If value is a template, we will already have cached its Proxy. Return it.
    return this.getTemplateBlock(value)?.template || value;
  }
  readOnlyProxyContainer(value) { // Handle a container of templates as a (read-only) container of templates.
    const self = this;
    return new Proxy(value, {     // Probably only useful for 'children'.
      get(target, key) { return self.proxify(target[key]); },
      set(target, key) { throw new Error(`Cannot set ${key} from outside the template because ${target} is not modeled as a block template.`); }
    });
  }
  setUnderlyingValue(key, value) {
    this._template[key] = value;
  }
  setParent(parentBlock) {
    // We set the underlying value becasue this is not meant to trigger a replicated message,
    // and indeed, the session may be over.
    this.setUnderlyingValue('parent', parentBlock?._template || null); // null, not undefined
  }
  get blockChildren() { return this._template.children.map(template => this.getTemplateBlock(template)); }
}

export class CroquetBlock extends Block(View(Croquet.View)) {
  static async create(croquetOptions) {
    const options = Object.assign({}, {model: CroquetModel, view: CroquetBlock}, croquetOptions);
    return (await Croquet.Session.join(options)).view;
  }
  // In this version, the Block IS the Croquet.View.
  // Later on, we'll need to separate these in order to use Blocks offline, recording messages to play them upon rejoining.
  get block() { return this; }
  get messenger() { return this; }
  get fullSpec() {
    let copy = Object.assign({}, this.spec),
	children = this.blockChildren.map(child => child.fullSpec);
    if (children.length) copy.specs = children;
    return copy;
  }
  // Note: In this configuration, we already have access to ready, pauseChange, and leave().
}
