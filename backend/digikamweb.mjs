
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

import http  from 'http';
import https from 'https';

import better_sqlite3 from 'better-sqlite3';
import {createConnection } from 'mariadb';

import { ZipWriter, BlobWriter, TextReader, Uint8ArrayReader} from "@zip.js/zip.js";

import { pgf2jpg } from '../addons/pgf2jpg/src/node/pgf2jpg.mjs';


	
/////////////////////////////////


var verbose  = false


for (var iarg = 2; iarg < process.argv.length; iarg++) {
	if (process.argv[iarg] === '-v') {
		verbose = true;
	}
	else {
		console.log('DIGIKAM-WEB ' + version);
		console.log('Options:');
		console.log('    -v      : verbose');
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
	var privateKey = fs.readFileSync(path.join(config.http.ssl_directory,'ido.key'), 'utf8');
	var certificate = fs.readFileSync(path.join(config.http.ssl_directory,'ido.crt'), 'utf8');
	var credentials = { key: privateKey, cert: certificate };
	httpserver = https.createServer(credentials, app);
}
else {
	httpserver = http.createServer(app);
}


// sessions

app.use(expresssession({ secret: 'digikam#2026@session',
	resave: false, saveUninitialized: false }));
app.use(body_parser.json());
app.use(body_parser.urlencoded({ extended: true }));

var session;
var sequence = 0;			// session sequence

app.use(function(req, res, next) {
	res.seq = sequence++;
	next();
});

// check if request is valid
const validate_role = (req, res, next) => {
	let params='';
	Object.entries(req.query).forEach(([key, value]) => params+=key+':'+value);
	printlog ('<-- '+req.method+' '+req.path+' {'+params+'}');
	let state = res.req.session && res.req.session.state;
	if (req.method=='GET' && (req.url=='/' ||
		req.url.startsWith('/js/') || req.url.startsWith('/css/') ||
		req.url.startsWith('/images/') || req.url.startsWith('/download/') ||
		req.url=='/favicon.ico' || req.url=='/index-n.html' ))
		next();
	else if (req.method=='POST' && (req.url=='/login'||req.url=='/logout'))
		next();
	else if (state && state=='loggedIn')
		next();
  	else
		respond_http_error (res, 401);
};

app.use (validate_role);


/////// messages and translations ///////

var http_codes = {
	401: 'Unauthorized',
	404: 'NotFound',
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
	session = req.session;
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

	if (allow_login) {
		session.role = config.users[iuser].role;
		session.lang = config.users[iuser].language;
		session.state = 'loggedIn';
		respond_json(res, {type:'table/login', rows:[{state:session.state, username:session.username, role:session.role,
						   lang:session.lang, languages:config.server.languages, translations:i18n[session.lang]}]});
		printlog(session.state + ': user='+session.username + ', role='+session.role);
	}
	else {
		session.state = 'invalid user/password';
		respond_json(res, { type:'error', rows:[{message:m(res,http_codes[401])}]});
	}
});

app.post('/logout', function(req, res) {
	session = req.session;
	session.username = req.body.username;
	session.state = 'loggedOut';
	respond_json(res, {type:'table/logout', rows:[{state: session.state}]});
	printlog(session.state + ': ' + session.username);
	req.session.destroy(function(err) {
		if (err) {
			console.log(err);
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

// return a list of albums
app.get('/albums{/:id}', function(req, res) {
	if (req.params.id && req.params.id!='undefined')
		respond_http_error (res, 501);
	else
		respond_json_query (res, get_sql('albums_list'), 'table/albums_list');
});

// return a list of tags
app.get('/tags{/:id}', function(req, res) {
	if (req.params.id && req.params.id!='undefined')
		respond_http_error (res, 501);
	else
		respond_json_query (res, get_sql('tags_list'), 'table/tags_list');
});

// else return thumbnails list corresponding to search parameters
 app.get('/search{/:id}', function(req, res) {
	let where = replace_sql(create_search_where(req.query.albumsid, req.query.tagsid, req.query.datetimes));

	let user_limit = req.query.limits==''? 100000: Number(req.query.limits);
	let server_limit = Number(config.http.thumbnails_limit);
	let best_limit = ''+ Math.min (server_limit, user_limit);
	let limit = create_search_limit (best_limit);
	
	if (req.params.id && req.params.id!='undefined')
		respond_http_error (res, 501);
	else if (req.query.tagsid.length > 0) {
		printlog ('search_tags',where);
		let sql = get_sql('search_tags', {where:where,limit:limit});
		respond_json_query (res, sql, 'table/search_tags');
	}
	else {
		printlog ('search_albums',where);
		respond_json_query (res, get_sql('search_albums',{where:where,limit:limit}), 'table/search_albums');
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

function respond_json_query (res, sql, type) {
	db_query (db_digikam, sql)
		.then ((rows) => {
			respond_json (res, {type:type?type:'table', rows:rows});
		})
		.catch ((error) => {
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

				if (false)									// tests
					dump_images (pgfdata,imageinfojpg.data);
				 
				respond_image (res, imageinfojpg);			// blob or base64
			}
		})
		.catch ((error) => {
			console.log(error);
			respond_http_error (res, 501);
		});
}


// for tests. dump last pgf and converted jpg
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
			AlbumRoots:   'AlbumRoots',
			Albums:       'Albums',
			Tags:         'Tags',
			Images:       'Images',
			ImageTags:    'ImageTags',
			UniqueHashes: 'dbthumbs.UniqueHashes',
			Thumbnails:   'dbthumbs.Thumbnails',
		}

		console.log(m(null,'Database')+ ': '+ config.database.type);

		const db_dir = config.database.sqlite3.directory;
		var dbpath_digikam = path.join (db_dir, 'digikam4.db');
		var dbpath_thumbs = path.join (db_dir, 'thumbnails-digikam.db');

		if (!fs.existsSync(dbpath_digikam)) {
			reject('*** database not found: '+dbpath_digikam);
			return;
		}
		db = better_sqlite3 (dbpath_digikam);		//, {verbose:console.log});

		var sql = 'ATTACH DATABASE "'+dbpath_thumbs+'" as dbthumbs';
		printlog ('... '+sql)
		db.exec('ATTACH DATABASE "'+dbpath_thumbs+'" as dbthumbs')

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
		var sqlnice = sql.match(/(.{1,10})/g).join('\n    + ');
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
			AlbumRoots:   'AlbumRoots',
			Albums:       'Albums',
			Tags:         'Tags',
			Images:       'Images',
			ImageTags:    'ImageTags',
			UniqueHashes: 'UniqueHashes',
			Thumbnails:   'Thumbnails',
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
		var sqlnice = sql.match(/(.{1,100})/g).join('\n    + ');
		printlog ('... '+sqlnice);
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
	albums_list:	'SELECT id, albumRoot, relativePath FROM ${Albums}',
	tags_list:		'SELECT id, pid, name FROM ${Tags}',
	thumbnail_data:	'SELECT ${Thumbnails}.id, ${Thumbnails}.modificationDate, ${Thumbnails}.orientationHint, ' +
						   '${Thumbnails}.data FROM ${Thumbnails} ' +
					'${where} ',
	image_url:		'SELECT ${Images}.id, ${Images}.album, ${Images}.name FROM ${Images} ' +
				 	'${where} ',
	search_albums:	'SELECT ${Images}.id, ${Images}.album, ${Images}.name, '+
						   '${Images}.modificationDate, ${UniqueHashes}.thumbId '+
					'FROM ${Images} ' +
					'INNER JOIN ${UniqueHashes} ON ${Images}.uniqueHash=${UniqueHashes}.uniqueHash ' +
					'INNER JOIN ${Thumbnails} ON ${Thumbnails}.id=${UniqueHashes}.thumbId ' +
					'${where} ' +
					'ORDER BY Images.modificationDate ASC ' + 
					'${limit} ',
	search_tags:	'SELECT ${Images}.id, ${Images}.album, ${Images}.name, '+
						   '${Images}.modificationDate, ${UniqueHashes}.thumbId '+
					'FROM ${ImageTags} ' +
					'INNER JOIN ${Images} ON ${ImageTags}.imageid=${Images}.id ' +
					'INNER JOIN ${UniqueHashes} ON ${Images}.uniqueHash=${UniqueHashes}.uniqueHash ' +
					'INNER JOIN ${Thumbnails} ON ${Thumbnails}.id=${UniqueHashes}.thumbId ' +
					'${where} ' +
					'ORDER BY Images.modificationDate ASC ' + 
					'${limit} ',
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
function create_search_limit (limits) {
	if (limits)
		return 'LIMIT '+limits+' ';
	return '';
}

// create search WHERE clause based on albums id, tags id and datetimes
function create_search_where (albums, tags, datetimes) {
	let subwhere_albums = where_or('${Images}.album',   albums);
	let subwhere_tags   = where_or('${ImageTags}.tagid', tags);
	let subwhere_dates  = where_dates('${Images}.modificationDate', datetimes);

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

var album_roots = []
var albums = []

function get_image_path (album, name) {
	const album_root_id = albums[album].albumRoot;
	const root_path = album_roots[album_root_id].specificPath;
	const album_path = albums[album].relativePath;
	return path.join (config.database.paths_prefix, root_path+album_path, name);
}
function get_image_url (album, name) {
	const album_root_id = albums[album].albumRoot;
	const root_label = album_roots[album_root_id].label;
	const album_path = albums[album].relativePath;
	return path.join (config.http.images_root, root_label, album_path, name);
}

// create symbolic link for albums_root in frontend/photos
// keep albums path to create image_url
function read_albums () {
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

			db_query (db_digikam, get_sql('albums_list'))
				.then ((rows) => {
					albums = [];
					for (let irow=0; irow<rows.length; irow++)
						albums[rows[irow].id] = rows[irow];
					console.log(''+albums.length+' albums');
				})
				.catch ((error) => { console.error(error)});
		 })
		.catch ((error) => { console.log(error)});
}




/////// main ///////

(async () => {
	printlog(m(null,'Welcome') + ' DigiKam WEB ' + version);
	db_open ()
		.then((db) => {
			db_digikam = db;
			
			read_albums();

			httpserver.listen(config.http.port, function() {
				console.log(m(null,'Server')+' @ http://localhost:' + config.http.port);
			});
		})
		.catch ((error) => {
			console.error(error.message);
			process.exit(1);
		});
})();

