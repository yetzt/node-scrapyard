	
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
		s.perform(task, function(err,data){
			if (s.config.debug === true) console.error('[done]'.magenta.inverse.bold, task.url.yellow);
			callback(err, data);
		});
	},s.config.connections);
	
	/* try several times to get an url */
	s.scrape = function(options, callback) {

		/* convenience method */
		if (typeof options === 'string') {
			options = {url: options};
		}

		/* type default*/
		if (!('type' in options)) {
			options.type = 'html';
		}

		options.it = (typeof options.it === 'undefined') ? 1 : (options.it+1);
		if (options.it > s.config.retry) {
			if (s.config.debug === true) console.error('[gvup]'.red.inverse.bold, options.url.yellow);
			callback(new Error('scrape failed after maximum number of retries'));
		} else {
			s.get(options, function(err, data){
				if (err) {
					if (s.config.debug === true) console.error('[retr]'.magenta.inverse.bold, options.url.yellow);
					setTimeout(function(){
						s.scrape(options, callback);
					},100); // with a little break
				} else {
					callback(null, data);
				}
			});
		}
	}
	
	/* try once to get an url */
	s.get = function(options, callback) {
		s.queue.push(options, function(err, data){
			callback(err, data);
		});
	};

	/* perform */
	s.perform = function(options, callback) {
		switch (options.type) {
			case 'xml': s.xml(options, callback); break;
			case 'json': s.json(options, callback); break;
			case 'html': s.html(options, callback); break;
			default: callback(new Error('invalid type '+options.type));
		}
	}
	
	/* get an xml resource */
	s.xml = function(options, callback) {
		s.fetch(options, function(err, data){
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
	s.json = function(options, callback) {
		s.fetch(options, function(err,data){
			if (err) {
				callback(err);
			} else {
				callback(null, JSON.parse(data));
			}
		});
	};

	/* get an html resource */
	s.html = function(options, callback) {
		s.fetch(options, function(err,data){
			if (err) {
				callback(err);
			} else {
				callback(null, cheerio.load(data));
			}
		});
	};

	/* fetch an url with request or get it from storage */
	s.fetch = function(options, callback) {
		s.storage.valid(options.url, s.config.timeout, function(valid){
			if (valid) {
				/* try to retrieve from storage */
				s.storage.get(options.url, function(err, data){
					if (err) {
						/* get and save */
						request(options, function(err, response, data){
							if (err || response.statusCode !== 200) {
								if (s.config.debug === true) console.error('[err!]'.magenta.inverse.bold, options.url.yellow);
								callback(err||new Error(response.statusCode));
							} else {
								callback(null, data);
								s.storage.put(options.url, data, function(){
									if (s.config.debug === true) console.error('[save]'.magenta.inverse.bold, options.url.yellow);
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
				request(options, function(err, response, data){
					if (err || response.statusCode !== 200) {
						if (s.config.debug === true) console.error('[err!]'.magenta.inverse.bold, options.url.yellow);
						callback(err||new Error(response.statusCode));
					} else {
						callback(null, data);
						s.storage.put(options.url, data, function(){
							if (s.config.debug === true) console.error('[save]'.magenta.inverse.bold, options.url.yellow);
						});
					}
				});
			}
		});
	};
	
	return s;
	
};

module.exports = scrapyard	;

