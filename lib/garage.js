var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

/* recursively make a directory */
var mkdirp = function(dir, callback) {
	var _dir = path.resolve(dir);
	fs.exists(_dir, function(exists){
		if (exists) {
			callback(null);
		} else {
			mkdirp(path.dirname(_dir), function(err){
				if (err) {
					callback(err);
				} else {
					fs.mkdir(_dir, function(err){
						callback(err);
					});
				}
			});
		}
	});
};

/* sha256 hash */
var sha256 = function(text) {
	return crypto.createHash('sha256').update(text).digest('hex');
}

/* key to filename */
var filename = function(key) {
	var _dir = [];
	sha256(key).split('').forEach(function(_char, _idx){
		_dir.push(_char);
		if (_idx < 9 && _idx%3 === 2) _dir.push('/');
	});
	return _dir.join('');
}

/* save a file */
var save = function(filename, data, callback) {
	fs.writeFile(filename, data, function(err){
		callback(err);
	});
}

var garage = function(store_path){

	var g = this;
	g.path = path.resolve(store_path);
	
	g.valid = function(key, expire, callback) {
		if (typeof expire === "function") {
			var callback = expire;
			var expire = null;
		} 
		var _file = path.resolve(g.path, filename(key));
		fs.exists(_file, function(exists){
			if (!exists) {
				callback(false);
			} else {
				if (!expire || expire === 0) {
					callback(true);
				} else {
					fs.stat(_file, function(err, stats){
						if (err) {
							callback(false);
						} else {
							if ((new Date().getTime() - stats.mtime.getTime()) >= expire) {
								callback(false);
							} else {
								callback(true);
							}
						}
					});
				}
			}
		});
	};

	g.put = function(key, data, callback) {
		var _file = path.resolve(g.path, filename(key));
		mkdirp(path.dirname(_file), function(err){
			if (!err) {
				save(_file, data, function(err){
					if (typeof callback === "function") {
						callback(err);
					}
				})
			} else {
				if (typeof callback === "function") {
					callback(err);
				}
			}
		});
	};

	g.get = function(key, callback) {
		var _file = path.resolve(g.path, filename(key));
		fs.exists(_file, function(exists){
			if (exists) {
				fs.readFile(_file, function(err, data){
					if (typeof callback === "function") {
						callback(err, data);
					}
				});
			} else {
				if (typeof callback === "function") {
					callback(true);
				}
			}
		});
	};
	
	return this;
	
};

module.exports = garage;
