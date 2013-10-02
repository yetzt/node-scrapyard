
var request = require("request");
var cheerio = require("cheerio");
var garage = require("garage");
var xml2js = require("xml2js");
var colors = require("colors");
var async = require("async");
var path = require("path");

var scrapyard = function(config) {
	var s = this;
	s.config = config;

	/* number of tries */
	if (!('retry' in s.config)) {
		s.config.retry = 5;
	} else {
		s.config.retry = parseInt(config.retry, 10);
	}

	/* number of connections */
	if (!('connections' in s.config)) {
		s.config.connections = 5;
	} else {
		s.config.connections = parseInt(config.connections, 10);
	}

	/* timeout */
	if (!('timeout' in s.config)) {
		s.config.timeout = (1000*60*60*24); // a day
	} else {
		s.config.timeout = parseInt(config.timeout, 10);
	}

	/* debug flag */
	if (!('debug' in s.config)) {
		s.config.debug = false;
	}
	
	/* determine cache path */
	if (!('cache' in s.config) || (typeof s.config.cache !== 'string')) {
		s.config.cache = path.resolve(process.cwd(), '.storage')
	} else {
		s.config.cache = path.resolve(s.config.cache);
	}
		
	/* initialize storage */
	s.storage = new garage(s.config.cache);
	
	/* async queue with concurrent conenctions */
	s.queue = async.queue(function(task, callback){
		if (s.config.debug === true) console.error('[next]'.magenta.inverse.bold, task.url.yellow);
		s.perform(task.url, task.type, function(err,data){
			if (s.config.debug === true) console.error('[done]'.magenta.inverse.bold, task.url.yellow);
			callback(err, data);
		});
	},s.config.connections);
	
	/* try several times to get an url */
	s.scrape = function(url, type, callback, it) {
		var _it = (typeof it === 'undefined') ? 1 : (it+1);
		if (_it > config.retry) {
			if (s.config.debug === true) console.error('[gvup]'.red.inverse.bold, url.yellow);
			callback(new Error('scrape failed after maximum number of retries'));
		} else {
			s.get(url, type, function(err, data){
				if (err) {
					if (s.config.debug === true) console.error('[retr]'.magenta.inverse.bold, url.yellow);
					setTimeout(function(){
						s.scrape(url, type, callback, _it);
					},100); // with a little break
				} else {
					callback(null, data);
				}
			});
		}
	}
	
	/* try once to get an url */
	s.get = function(url, type, callback) {
		s.queue.push({'url': url, 'type': type}, function(err, data){
			callback(err, data);
		});
	};

	/* perform */
	s.perform = function(url, type, callback) {
		switch (type) {
			case 'xml': s.xml(url, callback); break;
			case 'json': s.json(url, callback); break;
			case 'html': s.html(url, callback); break;
			default: callback(new Error('invalid type '+type));
		}
	}
	
	/* get an xml resource */
	s.xml = function(url, callback) {
		s.fetch(url, function(err,data){
			if (err) {
				callback(err);
			} else {
				new xml2js.Parser().parseString(data.toString(), function(err, data){
					if (err) {
						callback(err);
					} else {
						callback(null, data);
					}
				});
			}
		});
	};

	/* get a json resource */
	s.json = function(url, callback) {
		s.fetch(url, function(err,data){
			if (err) {
				callback(err);
			} else {
				callback(null, JSON.parse(data));
			}
		});
	};

	/* get an html resource */
	s.html = function(url, callback) {
		s.fetch(url, function(err,data){
			if (err) {
				callback(err);
			} else {
				callback(null, cheerio.load(data));
			}
		});
	};

	/* fetch an url with request or get it from storage */
	s.fetch = function(url, callback) {
		s.storage.valid(url, s.config.timeout, function(valid){
			if (valid) {
				/* try to retrieve from storage */
				s.storage.get(url, function(err, data){
					if (err) {
						/* get and save */
						request.get(url, function(err, response, data){
							if (err || response.statusCode !== 200) {
								if (s.config.debug === true) console.error('[err!]'.magenta.inverse.bold, url.yellow);
								callback(err||new Error(response.statusCode));
							} else {
								callback(null, data);
								s.storage.put(url, data, function(){
									if (s.config.debug === true) console.error('[save]'.magenta.inverse.bold, url.yellow);
								});
							}
						});
					} else {
						/* call back */
						callback(null, data);
					}
				});
			} else {
				/* get a new one */
				request({url: url, encoding: "binary"}, function(err, response, data){
					if (err || response.statusCode !== 200) {
						if (s.config.debug === true) console.error('[err!]'.magenta.inverse.bold, url.yellow);
						callback(err||new Error(response.statusCode));
					} else {
						callback(null, data);
						s.storage.put(url, data, function(){
							if (s.config.debug === true) console.error('[save]'.magenta.inverse.bold, url.yellow);
						});
					}
				});
			}
		});
	};
	
	return s;
	
};

module.exports = scrapyard;

