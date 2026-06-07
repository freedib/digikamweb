
// digiKam web - backend

// Didier Bertrand © 2026

const version = "1.0.0";

import os   from 'os';
import path from 'path';
import fs   from "fs";

const __dirname = import.meta.dirname;

import toml from 'toml';

import express        from 'express';
import expresssession from 'express-session';
import body_parser    from 'body-parser';

import crypto from 'node:crypto';

import http  from 'http';
import https from 'https';

import better_sqlite3 from 'better-sqlite3';
import {createConnection } from 'mariadb';

import { ZipWriter, BlobWriter, TextReader, Uint8ArrayReader} from "@zip.js/zip.js";

import { pgf2jpg } from '../addons/pgf2jpg/src/node/pgf2jpg.mjs';


	
/////////////////////////////////


let verbose = false;
let verboseW = false;


for (var iarg = 2; iarg < process.argv.length; iarg++) {
	if (process.argv[iarg] === '-v') {
		verbose = true;
	}
	else if (process.argv[iarg] === '-w') {
		verboseW = true;
	}
	else {
		console.log('DIGIKAM-WEB ' + version);
		console.log('Options:');
		console.log('    -v      : verbose');
		console.log('    -w      : verbose development');
		process.exit();
	}
}



/////// configuration ///////


// load config

var config = null;

try {
	const toml_text = fs.readFileSync('digikamweb.toml', 'utf8');
	config = toml.parse(toml_text);
} catch (e) {
	console.error("Error parsing toml content on line " + e.line + ", column " + e.column + ": " + e.message);
}


// load translations

var i18n = {};

try {
	const toml_text = fs.readFileSync('translations.toml', 'utf8');
	i18n = toml.parse(toml_text);
} catch (e) {
	console.error("Error parsing toml content on line " + e.line + ", column " + e.column + ": " + e.message);
}



///////  express and modules /////// 


const app = express();


// httpserver
var httpserver, updateserver;

if (config.http.force_ssl) {
	var privateKey = fs.readFileSync(path.join(config.http.ssl_directory,'digikamweb.key'), 'utf8');
	var certificate = fs.readFileSync(path.join(config.http.ssl_directory,'digikamweb.crt'), 'utf8');
	var credentials = { key: privateKey, cert: certificate };
	httpserver = https.createServer(credentials, app);
}
else {
	httpserver = http.createServer(app);
}


// sessions

app.use(expresssession({
	secret: 'digikam#2026@session',
	resave: false,
	saveUninitialized: false,
	cookie: {
		secure: false,
		httpOnly: true,
		maxAge: 1000 * 60 * 60 * 24
	}
}));
app.use(body_parser.json());
app.use(body_parser.urlencoded({ extended: true }));


var sessions={};


// check if request is valid
const validate_role = (req, res, next) => {
	let params='';
	Object.entries(req.query).forEach(([key, value]) => params+=key+':'+value);
	printlog ('<-- '+req.method+' '+req.path+' {'+params+'}');
	if (req.method=='GET' && (req.url=='/' ||			// static routing
		req.url.startsWith('/js/') || req.url.startsWith('/css/') ||
		req.url.startsWith('/images/') || req.url.startsWith('/download/') ||
		req.url=='/favicon.ico' || req.url=='/index-n.html' ))
		next();
	else if (req.method=='POST' && (req.url=='/login'||req.url=='/logout'))
		next();
	else if (sessions[req.sessionID])		// check if seesion have been created
		next();
	else
		respond_http_error (res, 401);
};

app.use (validate_role);


/////// messages and translations ///////

var http_codes = {
	401: 'Unauthorized',
	403: 'Forbidden',
	407: 'NotFound',
	500: 'InternalServerError',
	501: 'NotImplemented',
}


function m (res,messageid) {
	let i18n_section=null;
	if (res && res.req && res.req.session && res.req.session.lang)
		i18n_section = i18n[res.req.session.lang];
	else
		i18n_section = i18n[config.server.language];
	if (i18n_section && i18n_section.backend)
		return i18n_section.backend[messageid];
	else
		return messageid;
}

function printlog (...message) {
	if (verbose)
	//	console.log (new Date().toISOString()+': '+message);
		console.log (...message);
}

function printwlog (...message) {
	if (verboseW)
	//	console.log (new Date().toISOString()+': '+message);
		console.log (...message);
}



/////// static routing ///////

var root_dir = config.http.root_dir;
if (config.http.root_dir==null)
	root_dir = path.join(__dirname, '..', 'frontend');
else if (config.http.root_dir.startsWith('/'))
	root_dir = config.http.root_dir;
else
	root_dir = path.join(__dirname, config.http.root_dir);


app.use('/', express.static(root_dir));



/////// dynamic routing ///////

app.post('/login', function(req, res) {
	let session = req.session;
	session.username = req.body.username;
	session.role = '';
	session.lang = 'fr';

	let allow_login=false;
	let allow_local=false;

	let hostname = req.headers.host.split(':')[0];
	if (session.username.length==0 && config.http.local_trusted && hostname=='localhost') {
		session.username = 'local';
		allow_local = true;
	}

	let iuser;
	for (iuser=0; iuser<config.users.length; iuser++) {
		if (session.username===config.users[iuser].user &&
				req.body.password===config.users[iuser].password &&
				(req.body.password.length>0 || allow_local)) {
			allow_login = true;
			break;
		}
	}

	printwlog ('??? login:  sessionID='+session.req.sessionID);
	if (allow_login) {
		if (false)			// future...
			session.key = crypto.randomBytes(32).toString('base64');
		else
			session.key = session.req.sessionID;
		session.role = config.users[iuser].role;
		session.lang = config.users[iuser].language;
		session.state = 'loggedIn';

		respond_json(res, {type:'table/login', rows:[{state:session.state, username:session.username, role:session.role,
						   max_thumbnails:config.http.thumbnails_default, 
						   lang:session.lang, languages:config.server.languages, translations:i18n[session.lang]}]});
		// add session to server sessions list
		sessions[session.key] = {state: session.state, user:config.users[iuser]};
		printwlog ('??? login:  sessions('+Object.keys(sessions).length+'): +++', session.key);
		printlog('!!! session:  '+session.state + ': ' + session.username);
		update_restricted_albums (session.key);
		update_restricted_tags (session.key);
	}
	else {
		session.state = 'loggedOut';
		respond_json(res, { type:'error', rows:[{message:m(res,http_codes[403])}]});	// http code 200 but app error
	}
});

app.post('/logout', function(req, res) {
	let session = req.session;
	printwlog ('??? logout: sessions('+Object.keys(sessions).length+'): --- '+ req.session.key);

	if (session.key && sessions[session.key])		// delete session from server sessions list
		delete sessions[session.key];
	
	printwlog ('??? logout: sessions('+Object.keys(sessions).length+')');

	req.session.destroy(function(err) {
		if (err)
			console.log(err);
		else {
			session.username = req.body.username;
			session.state = 'loggedOut';
			printlog('!!! session: '+session.state + ': ' + session.username);
			respond_json(res, {type:'table/logout', rows:[{state: session.state}]});
		}
	});
});


// return translation for a provided code
app.get('/translations{/:lang}', function(req, res) {
	if (req.params.lang && req.params.lang!='undefined')
		respond_json(res, {type:'table/translations', rows:[{translations: i18n[req.params.lang]}]});
	else
		respond_http_error (res, 501);
});

// return an albums list
app.get('/albums{/:id}', function(req, res) {
	let sort = req.query.sort? req.query.sort: 'ASC';
	if (req.params.id && req.params.id!='undefined')
		respond_http_error (res, 501);
	else
		respond_json_query (res, get_sql('albums_list',{sort:sort}), 'table/albums_list', filter_albums);
});

// return a tags list
app.get('/tags{/:id}', function(req, res) {
	let sort = req.query.sort? req.query.sort: 'ASC';
	if (req.params.id && req.params.id!='undefined')
		respond_http_error (res, 501);
	else
		respond_json_query (res, get_sql('tags_list',{sort:sort}), 'table/tags_list', filter_tags);
});

// else return thumbnails list corresponding to search parameters
 app.get('/search{/:id}', function(req, res) {
	let user_max_thumbnails = req.query.max_thumbnails==''? 100000: req.query.max_thumbnails;
	let server_max_thumbnails = config.http.thumbnails_limit;
	let max_thumbnails = ''+ Math.min (Number(server_max_thumbnails), Number(user_max_thumbnails));
	let limit = create_search_limit (max_thumbnails);
	let sort = req.query.sort? req.query.sort: 'ASC';
	let where, sql;
	
	if (req.params.id && req.params.id!='undefined')
		respond_http_error (res, 501);
	else if (req.query.tagsid.length > 0) {
		where = replace_sql(create_search_where(req.query.albumsid, req.query.tagsid, req.query.datetimes));
		sql = get_sql('search_tags', {where:where,limit:limit,sort:sort});
		respond_json_query (res, sql, 'table/search_tags');
	}
	else {
		let user = sessions[req.session.key].user;
		let albumsid;
		if (req.query.albumsid=='' && user.albumsid)			// no selection. select all resricted albums
			albumsid = user.albumsid.join(',');
		else if (req.query.albumsid!='' && user.albumsid)	 {	// selection, filter only restricted albums
			let reqid = req.query.albumsid.split(',');
			albumsid = user.albumsid.filter(function(value, index, array) {
				return reqid.indexOf(''+value) >= 0;
			});
			albumsid = albumsid.join(',');
		}
		else													// no selection, no restricted. no where clause
			albumsid = req.query.albumsid;
		
		where = replace_sql(create_search_where(albumsid, req.query.tagsid, req.query.datetimes));
		respond_json_query (res, get_sql('search_albums',{where:where,limit:limit,sort:sort}), 'table/search_albums');
	}
});

// if id is provided, return the url_of_image/image_data or for this imageid
app.get('/images{/:id}', function(req, res) {
	if (req.params.id && req.params.id!='undefined') {
		let where = replace_sql(create_images_where(req.params.id));
		let sql = get_sql('image_url', {where:where});
		respond_image_data (res, sql, req.params.id);
	}
	else
		respond_http_error (res, 501);
});

// if id provided return the thumbnail data for this thumbid
app.get('/thumbnails{/:id}', function(req, res) {
	if (req.params.id && req.params.id!='undefined') {
		let where = replace_sql(create_thumbnails_where(req.params.id));
		let sql = get_sql('thumbnail_data', {id:req.params.id,where:where});
		respond_thumbnail_query (res, sql);
	}
	else
		respond_http_error (res, 501);
});

// save images specified in parameters to zip file
app.get('/save{/:id}', function(req, res) {
	if (req.params.id && req.params.id!='undefined')
		respond_http_error (res, 501);
	else {
		let where = replace_sql(create_images_where(req.query.imagesid));
		let sql = get_sql('image_url', {where:where});
		respond_zip (res, sql);
	}
});



/////// database queries and http responses ///////


function respond_db_error (res, err) {
	if (res && res.json) {
		printlog ('### respond_db_error: database error: err.code='+err.code+' err.message='+err.message);
		res.json ({type:'error', rows:[{code:err.code, message:err.message}]});
	}
}

function respond_http_error (res, code) {
	if (code && res.status) {		// http error
		printlog ('!!! respond_http_error: http error: code='+code);
		res.status(code).json({type:'error', rows:[{code:code, message:m(res,http_codes[code])}]});
	}
}

function respond_json (res, content) {
	if (content) {				// db rows
		printlog ('=== type='+content.type+', #rows='+(content.rows&&content.rows.length));
		res.json (content);			// standard response. status=200
	}
}

function respond_json_query (res, sql, type, filter) {
	db_query (db_digikam, sql)
		.then ((rows) => {
			if (filter)
				rows = filter(res.req.session.key, rows);
			respond_json (res, {type:type?type:'table', rows:rows});
		})
		.catch ((error) => {
			if (verboseW)
				throw(error);							// in development want full trace
			respond_db_error (res, error);
		});
}

function respond_image (res, imageinfo) {
	//  {type:'image/jpeg', data:jpgdata, width:200, height:100}
	res.setHeader('X-image-width', imageinfo.width);
	res.setHeader('X-image-height', imageinfo.height);
	if (config.http.use_blobs) {					// blob
		const imageBlob = new Blob([imageinfo.data], { type: imageinfo.type });
		res.type(imageBlob.type);
		imageBlob.arrayBuffer().then((imageArrayBuffer) => {
			printlog ('=== type=blob, #rows=1');
		    res.send(Buffer.from(imageArrayBuffer));
		});
	}
	else {											// base64 + json
		imageBase64 = imageinfo.data.toString('base64');
		respond_json (res, {type:'image/base64', rows:[{data:imageBase64}]});
	}
}

function respond_thumbnail_query (res, sql) {
	db_query (db_digikam, sql)
		.then ((rows) => {
			if (rows.length < 1)
				respond_http_error (res, 404);
			else {
			//	printlog (rows[0].id, rows[0].orientationHint);
				var pgfdata = Buffer.from(rows[0].data, 'binary');
				var imageinfojpg = pgf2jpg(pgfdata,rows[0].orientationHint);
				if (imageinfojpg) {
					if (false)									// tests
						dump_images (pgfdata,imageinfojpg.data);
					respond_image (res, imageinfojpg);			// blob or base64
				}
			}
		})
		.catch ((error) => {
			console.log(error);
			respond_http_error (res, 501);
		});
}


// used for tests. dump last pgf and converted jpg
function dump_images (pgfdata, jpgdata) {
	printlog ('pgfdata: '+pgfdata.length+', jpgdata: '+pgfdata.length);
	fs.writeFile('/tmp/thumbnail.pgf', pgfdata, (err) => {
		if (err)
			console.log(err);
	});
	fs.writeFile('/tmp/thumbnail.jpg', jpgdata, (err) => {
		if (err)
			console.log(err);
	});
}


function respond_image_data (res, sql, id) {
	db_query (db_digikam, sql)
		.then ((rows) => {
			if (rows.length < 1)
				respond_http_error (res, 404);
			else if (config.http.use_urls) {			// url of image
				const url = get_image_url (rows[0].album, rows[0].name);
				respond_json(res, {type:'image/url', rows:[{id:id, url:url}]});
			}
			else {										// blob or base64
				const filepath = get_image_path (rows[0].album, rows[0].name);
				fs.readFile(filepath, (error, data) => {
					if (error)
						respond_http_error (res, 404);
					else {
						imageinfo = {data:data, type:'image/jpeg', width:'0', height:'0'};
						respond_image (res, imageinfo);
					}
				});
			}
		})
		.catch ((error) => {
			console.log(error);
			respond_http_error (res, 501);
		});
}

function respond_zip (res, sql) {
		db_query (db_digikam, sql)
		.then ((rows) => {
			printlog(rows);
			if (rows.length>0)
				respond_zip_create (res, rows);
		})
		.catch ((error) => {
			respond_db_error (res, error);
		});
}



/////// databases ///////

// open and create database if required

var db_type;
var db_digikam = null;
var db_tables = {}
var db_open, db_close, db_query

db_config ();

function db_config () {
	if (config.database.type=='sqlite3') {
		db_open  = db_open_sqlite3;
		db_close = db_close_sqlite3;
		db_query = db_query_sqlite3;
	}
	else if (config.database.type=='mariadb') {
		db_open  = db_open_mariadb;
		db_close = db_close_mariadb;
		db_query = db_query_mariadb;
	}
	else {
		console.error('Invalid database type: "' + config.database.type + '"');
		db_open  = db_open_mariadb;
	}
}

function db_open_dummy () {
}

// better_sqlite3

function db_open_sqlite3 () {
	return new Promise ((resolve, reject) => {
		db_tables['sqlite3'] = {
			AlbumRoots:       'AlbumRoots',
			Albums:           'Albums',
			Tags:             'Tags',
			Images:           'Images',
			ImageInformation: 'ImageInformation',
			ImageTags:        'ImageTags',
			UniqueHashes:     'dbthumbs.UniqueHashes',
			Thumbnails:       'dbthumbs.Thumbnails',
		}

		console.log(m(null,'Database')+ ': '+ config.database.type);

		const db_dir = config.database.sqlite3.directory;
		let dbpath_digikam = path.join (db_dir, 'digikam4.db');
		let dbpath_thumbnails = path.join (db_dir, 'thumbnails-digikam.db');

		if (!fs.existsSync(dbpath_digikam)) {
			reject('*** database not found: '+dbpath_digikam);
			return;
		}
		if (!fs.existsSync(dbpath_thumbnails)) {
			reject('*** database not found: '+dbpath_thumbnails);
			return;
		}

		printlog('... MAIN   DATABASE "'+ dbpath_digikam+'"');
		let db = better_sqlite3 (dbpath_digikam);		//, {verbose:console.log});

		var sql = 'ATTACH DATABASE "'+dbpath_thumbnails+'" as dbthumbs';
		printlog ('... '+sql)
		db.exec('ATTACH DATABASE "'+dbpath_thumbnails+'" as dbthumbs')

		resolve(db);
	});
}

function db_close_sqlite3 (db) {
	if (db)
		db.close ();
	return null;
}

function db_query_sqlite3 (db, sql) {
	return new Promise ((resolve, reject) => {
		let nicesql = sql.match(/(.{1,100})/g).join('\n    + ');
		printlog ('... '+nicesql);

		try {
			resolve (db.prepare(sql).all());
		} catch (error) {
			reject (error);
		}
	});
}


// mariadb

function db_open_mariadb () {
	return new Promise ((resolve, reject) => {
		db_tables['mariadb'] = {
			AlbumRoots:       'AlbumRoots',
			Albums:           'Albums',
			Tags:             'Tags',
			Images:           'Images',
			ImageInformation: 'ImageInformation',
			ImageTags:        'ImageTags',
			UniqueHashes:     'UniqueHashes',
			Thumbnails:       'Thumbnails',
		}

		console.log(m(null,'Database') + ': ' + config.database.type + ' ' + config.database.mariadb.connection);

		let db_info;
		if (config.database.mariadb.connection=='host')
			db_info = {
				host: config.database.mariadb.host,
				user: config.database.mariadb.user,
				password: config.database.mariadb.password,
				database: 'digikam',
				bigIntAsNumber: true,
				dateStrings: true,
			};
		else if (config.database.mariadb.connection=='socket')
			db_info = {
				socketPath: config.database.mariadb.socket,
				database: 'digikam',
				bigIntAsNumber: true,
				dateStrings: true,
			};
		else
			throw new Error('Connection parameter invalid');
		
		printlog('... USE "digikam"');
		createConnection(db_info)
			.then((db) => {
				resolve(db);
			})
			.catch((err) => {
				reject(err);
			});
	});
}

function db_close_mariadb (db) {
	if (db)
		db.end();
	return null;
}

function db_query_mariadb (db, sql) {
	return new Promise ((resolve, reject) => {
		var nicesql = sql.match(/(.{1,100})/g).join('\n    + ');
		printlog ('... '+nicesql);
		db.query(sql)
			.then ((rows) => {
				resolve(rows);
			})
			.catch ((error) => {
				reject(error);
			});
	});
}


/////// dabase statements ///////

var sql_statements = {
	roots_list:		'SELECT id, label, specificPath FROM ${AlbumRoots}',
	albums_list:	'SELECT id, albumRoot, relativePath FROM ${Albums} ' +
					'ORDER BY relativePath ${sort}', 
	tags_list:		'SELECT id, pid, name FROM ${Tags} ' +
					'ORDER BY name ${sort}',
	thumbnail_data:	'SELECT ${Thumbnails}.id, ${Thumbnails}.modificationDate, ${Thumbnails}.orientationHint, ' +
						   '${Thumbnails}.data FROM ${Thumbnails} ' +
					'${where}',
	image_url:		'SELECT ${Images}.id, ${Images}.album, ${Images}.name FROM ${Images} ' +
				 	'${where}',
	search_albums:	'SELECT ${Images}.id, ${Images}.album, ${Images}.name, '+
						   '${ImageInformation}.creationDate, ${UniqueHashes}.thumbId '+
					'FROM ${Images} ' +
					'INNER JOIN ${ImageInformation} ON ${ImageInformation}.imageid=${Images}.id ' +
					'INNER JOIN ${UniqueHashes} ON ${Images}.uniqueHash=${UniqueHashes}.uniqueHash ' +
					'INNER JOIN ${Thumbnails} ON ${Thumbnails}.id=${UniqueHashes}.thumbId ' +
					'${where} ' +
					'ORDER BY ${ImageInformation}.creationDate ${sort} ${limit}',
	search_tags:	'SELECT ${Images}.id, ${Images}.album, ${Images}.name, '+
						   '${ImageInformation}.creationDate, ${UniqueHashes}.thumbId '+
					'FROM ${ImageTags} ' +
					'INNER JOIN ${Images} ON ${ImageTags}.imageid=${Images}.id ' +
					'INNER JOIN ${ImageInformation} ON ${ImageInformation}.imageid=${Images}.id ' +
					'INNER JOIN ${UniqueHashes} ON ${Images}.uniqueHash=${UniqueHashes}.uniqueHash ' +
					'INNER JOIN ${Thumbnails} ON ${Thumbnails}.id=${UniqueHashes}.thumbId ' +
					'${where} ' +
					'ORDER BY ${ImageInformation}.creationDate ${sort} ${limit}',
}


function get_sql (statement_key, args) {
	return replace_sql (sql_statements[statement_key], args);
}

// replace ${table} and ${arg} variables
function replace_sql (statement, args) {
	let tables = db_tables[config.database.type];
	for (let table in tables)
		statement = statement.replaceAll('${'+table+'}', tables[table]);
	for (let arg in args)
		statement = statement.replaceAll('${'+arg+'}', args[arg]);
	return statement;
}

// create search LIMIT clauses
function create_search_limit (limit) {
	if (limit)
		return 'LIMIT '+limit+' ';
	return '';
}

// create search WHERE clause based on albumsid, tagsid and datetimes
function create_search_where (albumsid, tagsid, datetimes) {
	let subwhere_albums = where_or('${Images}.album', albumsid);
	let subwhere_tags   = where_or('${ImageTags}.tagid', tagsid);
	let subwhere_dates  = where_dates('${ImageInformation}.creationDate', datetimes);

	let where = where_and ([subwhere_albums, subwhere_tags, subwhere_dates]);
	return where.length>0? 'WHERE '+where+' ': '';
}

// create images WHERE clause based on images ids
function create_images_where (ids) {
	let where = where_or('${Images}.id', ids);
	return where.length>0? 'WHERE '+where+' ': '';
}

// create thumbnails WHERE clause based on images ids
function create_thumbnails_where (ids) {
	let where = where_or('${Thumbnails}.id', ids);
	return where.length>0? 'WHERE '+where+' ': '';
}

function where_or (column, list) {
//	printlog('??? where_or: column='+column+', list='+list);
	if (list.length == 0)
		return '';
	list = list.split(',');
	let subwhere='', verb='';
	subwhere += '(';
	for (let item in list) {
		if (list[item].indexOf('_') > 0)
			list[item] = list[item].split('_')[1];		// format thumbnailId_imageId_date
		subwhere += verb + column + '=' + list[item];
		verb = ' OR ';
	}
	subwhere += ')';
	return subwhere;
}

function where_and (list) {
//	printlog('list='+list);
	let subwhere='', verb='';
	for (let item in list) {
		if (list[item].length==0)
			continue;
		subwhere += verb + list[item];
		verb = ' AND ';
	}
	return subwhere;
}

function where_dates (key, list) {
	list = list.split(',');
	let subwhere_date_start = where_date (key, list[0], true);
	let subwhere_date_end   = where_date (key, list[1], false);
	let subwhere_dates = where_and ([subwhere_date_start, subwhere_date_end]);
	return subwhere_dates;
}
function where_date (key, datetime, isstart) {
	if (!datetime || datetime.length==0)
		return '';
	let indextime = datetime.indexOf('_');
	let date8 = indextime>=0? datetime.substring(0,indextime): datetime;
	let time6 = indextime>=0? datetime.substring(indextime+1): '';

	let date=null, time=null;
	let aa, mm, dd, hh, ss;
	
	aa = date8.substring(0,4);
	mm = date8.length>4? date8.substring(4,6): null;
	dd = date8.length>6? date8.substring(6): null;
	mm = mm? mm: (isstart? '01': '12');
	dd = dd? dd: (isstart? '01': '31');				// ok to have 02-31 in sql request
	date = aa+'-'+mm+'-'+dd;

	if (indextime>=0) {
		hh = time6.substring(0,2);
		mm = time6.length>2? time6.substring(2,4): null;
		ss = time6.length>4? time6.substring(4): null;
		mm = mm? mm: (isstart? '00': '59');
		ss = ss? ss: (isstart? '00': '59');
		time = hh+'-'+mm+'-'+ss;
	}

	let newdatetime = '"' + (indextime>=0? date+' '+time: date) + '"';
	return '(' + key + (isstart?' >= ':' <= ') + newdatetime + ')'; 
}


/////// zip utilities ///////


async function respond_zip_create (res, rows) {

	try {

	printlog ('respond_zip_create', rows);

	let zipname = 'photos.zip';
	let urlpath = '/download';
	let zippath = path.join(config.http.root_dir, urlpath, zipname);	// what happen if exists?

	// Create a writer destination (stores zip content in memory as a Blob)
	const blobWriter = new BlobWriter("application/zip");
	const zipWriter = new ZipWriter(blobWriter);

	// Add a local files from disk
	for (let irow in rows) {
		let filepath = (get_image_path (rows[irow].album, rows[irow].name));
		printlog ('filepath='+filepath );
		const fileBuffer = await fs.readFileSync(filepath);
		await zipWriter.add(rows[irow].name, new Uint8ArrayReader(new Uint8Array(fileBuffer)));
	}
	
	// Close the ZIP writer to finalize the archive
	await zipWriter.close();

	// Get the final Blob data and write it to disk
	const zipBlob = await blobWriter.getData();
	const arrayBuffer = await zipBlob.arrayBuffer();

	printlog('zippath='+zippath);
	await fs.writeFileSync(zippath, Buffer.from(arrayBuffer));

	printlog("ZIP file successfully created!");
	respond_json (res, {type:'table/path', rows:[{path:urlpath, name:zipname}]});


	} catch (e) {
		console.error("Error create ZIP: "+e);
	}
}



/////// paths utilities ///////

// on start, read album_roots and albums to know read pictures path
// also used to constrict search request when user have restricted_albums
var album_roots = []
var albums_list = []

// on start, read tags to expand user restricted_tags wildcards 
var tags_list = []


function get_image_path (album, name) {
	const album_root_id = albums_list[album].albumRoot;
	const root_path = album_roots[album_root_id].specificPath;
	const album_path = albums_list[album].relativePath;
	return path.join (config.database.paths_prefix, root_path+album_path, name);
}
function get_image_url (album, name) {
	const album_root_id = albums_list[album].albumRoot;
	const root_label = album_roots[album_root_id].label;
	const album_path = albums_list[album].relativePath;
	return path.join (config.http.images_root, root_label, album_path, name);
}

// create symbolic link for albums_root in frontend/photos
function read_roots () {
	db_query (db_digikam, get_sql('roots_list'))
		.then ((rows) => {
			album_roots = [];
			for (let irow=0; irow<rows.length; irow++) {
				album_roots[rows[irow].id] = rows[irow];
				if (config.http.use_urls) {
					try {
					//	printlog('ln -s '+config.database.paths_prefix+rows[irow].specificPath+' '+root_dir);
						const src = config.database.paths_prefix+rows[irow].specificPath;
						const dst = path.join (root_dir, config.http.images_root, rows[irow].label);
						fs.symlink(src, dst, (error) => {
							// console.log(error);
						});
					}
					catch (error) {	}
				}
			}
		 })
		.catch ((error) => { console.log(error)});
}

// keep albums path to create image_url
function read_albums () {
	db_query (db_digikam, get_sql('albums_list',{sort:'ASC'}))
		.then ((rows) => {
			albums_list = [];
			for (let irow=0; irow<rows.length; irow++)
				albums_list[rows[irow].id] = rows[irow];
			printlog(''+albums_list.length+' albums_list');
		})
		.catch ((error) => { console.error(error)});
}

// keep tags name to expand user restricted_tags
function read_tags () {
	db_query (db_digikam, get_sql('tags_list',{sort:'ASC'}))
		.then ((rows) => {
			tags_list = [];
			for (let irow=0; irow<rows.length; irow++)
				tags_list[rows[irow].id] = rows[irow];
			printlog(''+tags_list.length+' tags_list');
		})
		.catch ((error) => { console.error(error)});
}


// get restricted albumsid for a user
function update_restricted_albums (sessionkey) {
	let user = sessions[sessionkey].user;

	user.albumsid = null;

	if (user.restrict_albums && user.restrict_albums.length>0) {
		user.albumsid = [];
		for (let ira=0; ira<user.restrict_albums.length; ira++) {
			let ura = albums_list.find(ra => ra && ra.relativePath==user.restrict_albums[ira]);
			user.albumsid.push(ura.id);
		}
		printwlog ('update_restricted_albums: user.albumsid=', user.albumsid);
	}
}

// get restricted tagsid for a user
// expand '*' wildcard
function update_restricted_tags (sessionkey) {
	let user = sessions[sessionkey].user;
	user.tagsid = null;

	if (user.restrict_tags && user.restrict_tags.length>0) {
		user.tagsid = [];
		for (let irt=0; irt<user.restrict_tags.length; irt++) {
			let urt = tags_list.find(rt => rt && rt.name==user.restrict_tags[irt]);
			let istar;
			if (urt)
				user.tagsid.push(urt.id);
			else if ((istar = user.restrict_tags[irt].indexOf('*')) >= 0) {
				let starttag = user.restrict_tags[irt].substr(0,istar); 
				for (let it=0; it<tags_list.length; it++) {
					if (tags_list[it].name.startsWith(starttag))
						user.tagsid.push(tags_list[it].id);
				}
			}
		}
		printwlog ('update_restricted_tags: user.tagsid=', user.tagsid);
	}
}

// if user.restrict_albums constrict album list sent to browser 
function filter_albums (sessionkey,	rows) {
	let user = sessions[sessionkey].user;
	printwlog ('filter_albums:', user.restrict_albums, user.albumsid);
	
	if (user.albumsid && user.albumsid.length>0) {
		let user_rows = [];
		for (let irow=0; irow<rows.length; irow++) {
			if (user.albumsid.indexOf( rows[irow].id ) >= 0)
				user_rows.push(rows[irow]);
		}
		rows = user_rows;
	}
	return rows;
}

// if user.restrict_tags constrict tags list sent to browser 
function filter_tags (sessionkey, rows) {
	let user = sessions[sessionkey].user;
	printwlog ('filter_tags:', user.restrict_tags, user.tagsid);
	
	printwlog ('update_restricted_tags: user.tagsid=', user.tagsid);
	if (user.tagsid && user.tagsid.length>0) {
		let user_rows = [];
		for (let irow=0; irow<rows.length; irow++) {
			if (user.tagsid.indexOf( rows[irow].id ) >= 0)
				user_rows.push(rows[irow]);
		}
		rows = user_rows;
	}
	return rows;
}



/////// main ///////

(async () => {
	printlog(m(null,'Welcome') + ' DigiKam WEB ' + version);
	db_open ()
		.then((db) => {
			db_digikam = db;
			
			read_roots();	// create symbolic links for albums_roots
			read_albums();	// keep copy albums list
			read_tags();	// keep copy of tags list
			
			httpserver.listen(config.http.port, function() {
				console.log(m(null,'Server')+' @ http://localhost:' + config.http.port);
			});
		})
		.catch ((error) => {
			console.error(error);
			process.exit(1);
		});
})();

