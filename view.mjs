export function makeResolvablePromise() { // Return a Promise that has a resolve() method that can be called later.
  let capturedResolve,
      promise = new Promise((resolve) => {
	capturedResolve = resolve;
      });
  promise.resolve = capturedResolve;
  return promise;
}

export const View = (superclass) => class extends superclass {
  get spec() { return this.viewModel.spec; }
  ///* // fixme: make this easier, using initializeRootVeiw.
  get sessionCachedBlocks() {
    // Can't be global, because we may have several sessions going. (Or, for testing, multiple connections to the same session.)
    return this.session.templateBlocks || (this.session.templateBlocks = new WeakMap());
  }// */
  initializeRootView() { // Sets up some testing tools: this.cachedSession.pauseChange is a Promise resolved when we pause or resume due to visibility.
    // The point isn't to be aware of when the browser notices a change in visibility, but to notice when Croquet acts on it.
    // We could get a similar effect from our own view-join event, but it's just as tricky, as there can be multiple view-exit/view-join.
    if (this.session.model !== this.viewModel) return; // Don't check session.view, because it isn't set until after the root view is contructed.
    this.isRootView = true; // Still set after the root view is detached and session cleared. (Although we could also cache session in another property. (FIXME: we do!)
    this.cachedSession.pauseChange?.resolve('resumed');
    this.cachedSession.pauseChange = makeResolvablePromise();
  }
  detachRootView() {
    if (!this.isRootView) return;
    this.cachedSession.pauseChange?.resolve('paused');
    this.cachedSession.pauseChange = makeResolvablePromise();
  }
  constructor(viewModel) {
    //console.log(`view create ${JSON.stringify(viewModel.spec)}`);
    super(viewModel);
    this.viewModel = viewModel;
    this.outstanding = 0;
    this.readyPromise = null;
    this.cachedSession = this.session; // session is assigned by Croquet.View.constructor, but cleared when session ends. We need it in testing pause/resume.
    this.initializeRootView();
    this.subscribe(viewModel.id, 'setTemplateProperty', this.setTemplateProperty);
  }
  integrateChildren(models = this.viewModel.children) {
    const block = this.block;
    for (let model of models) {
      new this.constructor(model).block.setParent(block);
    }
  }

  setModelProperty(key, value) {
    ++this.outstanding;
    this.publish(this.viewModel.id, 'setSpecProperty', {key, value, from:this.viewId}); // See CroquetModel.
  }
  setTemplateProperty({key, value, from, viewModel}) {
    if (viewModel !== this.viewModel) return; // In case of multiple session clients in same browser.
    if (key === 'specs' && value !== null) { // specs is a weird pseudo-property.
      // It is not directly assigned (e.g., deleting other existing spec elements), nor are the spec elements appear directly.
      // Instead, the model has already created and parented new nodes. Now we integrate them.
      this.integrateChildren(value.map(spec => this.viewModel.getChild(spec.name)));
    } else {
      this.block.setUnderlyingValue(key, value);
      if (key === 'parent' && !value) setTimeout(() => this.detach());
    }
    if (from !== this.viewId) return; // Only count down our own assignments.
    if (--this.outstanding) return;
    this.resolveReady();
  }
  detach() {
    //console.log(`view detach ${this.block._template.name}`);
    this.detachRootView();
    this.block.setParent(null); // First, so that there is just one DOM reflow.
    let blockChildren = this.block.blockChildren.slice(); // copy!
    blockChildren.forEach(block => block.messenger.detach());
    super.detach();
    this.resolveReady() // Just in case someone's waiting.
  }
  leave() {
    return this.cachedSession.leave();
    // model.destroy() is NOT for cleanup, but for removing from the snapshot, which is not what we want to do here.
  }
  get ready() { // A promise that resolves when there are no longer any outstanding assignments on THIS block (not all blocks).
    if (this.readyPromise) return this.readyPromise;
    return this.readyPromise = makeResolvablePromise(); // Not yet resolved, regardless of what outstanding is before asking.
  }
  resolveReady() { // Internal. Resolve readyPromise, if any.
    if (!this.readyPromise) return;
    this.readyPromise.resolve();
    this.readyPromise = null;
  }

  // Used in testing. Do we need them?
  get isOnline() {
    return !!this.session;
  }
  get pauseChange() {
    return this.cachedSession.pauseChange;
  }
}
