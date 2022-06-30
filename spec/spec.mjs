import { Block } from '../index.mjs';
import { getKey } from '../../api-key/index.mjs';

Croquet.App.root = false; // Disable the default Croquet overlay so we can see Jasmine report from start to finish.
describe('Replicated', function () {
  it('smokes', function (done) {
    getKey('croquet')
      .then(apiKey => {
	let options = {
	  appId: "com.ki1r0y.replicated",
	  name: "x7",
	  apiKey,
	  password: "secret",
	};
	Block.initialize(options)
	  .then(async session => {
	    let block = session.block;
	    block.model.baz = 99;
	    block.model.foo = 17;
	    block.model.bar = 42;
	    block.model.baz = undefined;

	    await block.ready;
	    expect(block.model.foo).toBe(17);
	    console.log(JSON.stringify(block.spec));
	    expect(JSON.stringify(block.spec)).toBe('{"foo":17,"bar":42}');

	    await session.leave();
	    await Block.initialize(options);
	    console.log(JSON.stringify(block.spec));	    
	    expect(block.model.foo).toBe(17);
	    expect(JSON.stringify(block.spec)).toBe('{"foo":17,"bar":42}');

	    await session.leave();
	    done();
	  });
      });
  });
});
