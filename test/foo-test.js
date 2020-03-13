var tape = require("tape");
var MT = require("../");

tape("foo() returns the answer to the ultimate question of life, the universe, and everything.", function(test) {
  console.log(MT);
  test.equal(MT.foo(), 42);
  test.end();
});
