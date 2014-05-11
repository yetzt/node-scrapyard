#!/usr/bin/env node

/* require node modules */
var path = require("path");

/* require npm modules */
var request = require("request");
var cheerio = require("cheerio");
var garage = require("garage");
var xml2js = require("xml2js");
var colors = require("colors");
var async = require("async");
var dur = require("dur");

var scrapyard = function(config) {

	var s = this;
	s.config = config;

	/* number of tries */
	if (!s.config.hasOwnProperty('retry') || isNaN(parseInt(s.config.retry,10))) s.config.retry = 5;
	s.config.retry = parseInt(s.config.retry, 10);

	/* number of connections */
	if (!s.config.hasOwnProperty('connections') || isNaN(parseInt(s.config.connections,10))) s.config.connections = 5;
	s.config.connections = parseInt(s.config.connections, 10);

	/* best before */
	if (s.config.hasOwnProperty('timeout') && !s.config.hasOwnProperty('bestbefore')) s.config.bestbefore = s.config.timeout;
	if (!s.config.hasOwnProperty('bestbefore')) s.config.bestbefore = 0;
	if (typeof s.config.bestbefore === "string") s.config.bestbefore = dur(s.config.bestbefore);
	if (isNaN(parseInt(s.config.bestbefore, 10))) s.config.bestbefore = 0;
	s.config.bestbefore = parseInt(s.config.bestbefore, 10);

	/* debug flag */
	if (!s.config.hasOwnProperty('debug') || s.config.debug !== true) s.config.debug = false;
	
	/* determine cache path and initialize storage if cache is activated */
	if (!s.config.hasOwnProperty('cache') || (typeof s.config.cache !== 'string' && s.config.cache !== false)) {
		s.config.cache = path.resolve(process.cwd(), '.cache')
		s.storage = new garage(s.config.cache);
	} else if (typeof s.config.cache === "string") {
		s.config.cache = path.resolve(s.config.cache);
		s.storage = new garage(s.config.cache);
	} else {
		s.config.cache = false;
		s.storage = false;
	}

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

		/* backwards compatibility */
		if (typeof options !== 'object') {
			
			/* defaults */
			var opts = {
				url: arguments[0],
				type: "html",
				method: "GET",
				encoding: "binary"
			};
			
			/* walk through arguments */
			for (var i=0; i<arguments.length; i++) {
				switch (typeof arguments[i]) {
					case "function": 
						callback = arguments[i]; 
					break;
					case "string": 
						switch (arguments[i].toLowerCase()) {
							case "html": opts.type = "html"; break;
							case "xml": opts.type = "xml"; break;
							case "json": opts.type = "json"; break;
							case "get": opts.method = "GET"; break;
							case "post": opts.method = "POST"; break;
							case "binary": opts.encoding = "binary"; break;
							case "utf8": opts.encoding = "utf8"; break;
							default: if (i > 0 && s.config.debug) console.error('[warn]'.yellow.inverse.bold, ("unrecognized argument "+arguments[i]).yellow); break;
						}
					break;
					case "object": 
						opts.form = arguments[i];
					break;
				}
			}

			var options = opts;

		}

		/* default type html */
		if (!options.hasOwnProperty('type') && ["html","xml","json"].indexOf(options.type) < 0) options.type = 'html';

		options.it = (typeof options.it === 'undefined') ? 1 : (options.it+1);
		if (options.it > s.config.retry) {
			if (s.config.debug === true) console.error('[gvup]'.red.inverse.bold, options.url.yellow);
			callback(new Error('scrape failed after maximum number of retries'));
		} else {
			s.get(options, function(err, data){
				if (!err) return callback(null, data);
				if (s.config.debug === true) console.error('[retr]'.magenta.inverse.bold, options.url.yellow);
				/* wait for 100ms and try again */
				setTimeout(function(){
					s.scrape(options, callback);
				},100);
			});
		}
	};
	
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
	};
	
	/* get an xml resource */
	s.xml = function(options, callback) {
		s.fetch(options, function(err, data){
			if (err) return callback(err);
			new xml2js.Parser().parseString(data.toString(), function(err, data){
				if (err) return callback(err);
				callback(null, data);
			});
		});
	};

	/* get a json resource */
	s.json = function(options, callback) {
		s.fetch(options, function(err,data){
			if (err) return callback(err);
			callback(null, JSON.parse(data));
		});
	};

	/* get an html resource */
	s.html = function(options, callback) {
		s.fetch(options, function(err,data){
			if (err) return callback(err);
			callback(null, cheerio.load(data));
		});
	};

	/* fetch an url with request or get it from storage */
	s.fetch = function(options, callback) {
		if (s.storage) {
			s.storage.valid(options.url, s.config.bestbefore, function(valid){
				if (valid) {
					/* try to retrieve from storage */
					s.storage.get(options.url, function(err, data){
						if (err) {
							/* get and save */
							request(options, function(err, response, data){
								if ((err || response.statusCode !== 200) && s.config.debug === true) console.error('[err!]'.magenta.inverse.bold, options.url.yellow);
								if (err) return callback(err);
								if (response.statusCode !== 200) return callback(new Error("Response Status Code "+response.statusCode))
								callback(null, data);
								s.storage.put(options.url, data, function(){
									if (s.config.debug === true) console.error('[save]'.magenta.inverse.bold, options.url.yellow);
								});
							});
						} else {
							/* call back */
							callback(null, data.toString('utf8'));
						}
					});
				} else {
					/* get a new one */
					request(options, function(err, response, data){
						if ((err || response.statusCode !== 200) && s.config.debug === true) console.error('[err!]'.magenta.inverse.bold, options.url.yellow);
						if (err) return callback(err);
						if (response.statusCode !== 200) return callback(new Error("Response Status Code "+response.statusCode))
						callback(null, data);
						s.storage.put(options.url, data, function(){
							if (s.config.debug === true) console.error('[save]'.magenta.inverse.bold, options.url.yellow);
						});
					});
				}
			});
		} else {
			request(options, function(err, response, data){
				if ((err || response.statusCode !== 200) && s.config.debug === true) console.error('[err!]'.magenta.inverse.bold, options.url.yellow);
				if (err) return callback(err);
				if (response.statusCode !== 200) return callback(new Error("Response Status Code "+response.statusCode))
				callback(null, data);
			});
		}
	};
	
	return s;
	
};

module.exports = scrapyard;

