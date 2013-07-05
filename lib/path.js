/*!
 * Neoprene - Path class
 * MIT Licensed
 */

/**
 * Path contructor
 * @param  start {Node}
 * @param  end {Node}
 * @param  length {Number}        The length of the path.
 * @param  nodes {Nodes}          The nodes within tha path.
 * @param  resl {Relationships}   The relationships in the path.
 * @return {Path}                 The Path object.
 * @api    public
 */
var Path = module.exports = function Path(start, end, length, nodes, rels) {
  this._start = start;
  this._nodes = nodes;
  this._length = length;
  this._relationships = rels;
  this._end = end;
};


/*!
 * Path properties.
 */
Path.prototype = {
  get start (){
    return this._start || null;
  },
  get end (){
    return this._end || null;
  },
  get length (){
    return this._length || null;
  },
  get nodes (){
    return this._nodes || null;
  },
  get relationships (){
    return this._relationships || null;
  }
};
