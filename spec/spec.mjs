import { Block } from '../index.mjs';
import { getKey } from '../../api-key/index.mjs';

Croquet.App.root = false; // Disable the default Croquet overlay so we can see Jasmine report from start to finish.
describe('Replicated', function () {
  //jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
  it('smokes', function (done) {
    getKey('croquet')
      .then(async apiKey => {
	let options = {
	  appId: "com.ki1r0y.replicated",
	  name: "x18",
	  apiKey,
	  password: "secret",
	},
	    block = new Block({});
	await block.join(options);
	block.model.baz = 99;
	block.model.foo = 17;
	block.model.bar = 42;
	block.model.baz = undefined;
	await block.ready;

	expect(block.model.foo).toBe(17);
	expect(JSON.stringify(block.spec)).toBe('{"foo":17,"bar":42}');
	await block.leave();

	if (Block.Croquet.fake) options.options = block.spec; // Fake Croquet doesn't persist across sessions.
	await block.join(options);

	expect(block.model.foo).toBe(17);
	expect(JSON.stringify(block.spec)).toBe('{"foo":17,"bar":42}');
	await block.leave();
	done();
      });
  });
});
