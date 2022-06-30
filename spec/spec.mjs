import { Block } from '../index.mjs';
import { getKey } from '../../api-key/index.mjs';

Croquet.App.root = false; // Disable the default Croquet overlay so we can see Jasmine report from start to finish.
describe('Replicated', function () {
  it('smokes', function (done) {
    getKey('croquet')
      .then(async apiKey => {
	let block, session, options = {
	  appId: "com.ki1r0y.replicated",
	  name: "x8",
	  apiKey,
	  password: "secret",
	};
	session = await Block.initialize(options);
	block = session.block;
	block.model.baz = 99;
	block.model.foo = 17;
	block.model.bar = 42;
	block.model.baz = undefined;

	await block.ready;
	expect(block.model.foo).toBe(17);
	expect(JSON.stringify(block.spec)).toBe('{"foo":17,"bar":42}');
	await session.leave();
	
	session = await Block.initialize(options);
	block = session.block;
	expect(block.model.foo).toBe(17);
	expect(JSON.stringify(block.spec)).toBe('{"foo":17,"bar":42}');
	await session.leave();

	done();
      });
  });
});
