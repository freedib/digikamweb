#include <napi.h>
#include <iostream>

#include "pgf2jpg.h"


void FreeJPGData(Napi::BasicEnv env, char *jpgbuf) {
	if (PGF2JPG_DEBUG)
		printf ("... delete[]    <- jpgbuf(%p)\n", jpgbuf);
	delete[] jpgbuf;
}


Napi::Value ConvertPFG2JPG(const Napi::CallbackInfo &info) {
	Napi::Env env = info.Env();
	if (info.Length() < 1) {
		Napi::Error::New(env, "Expected one argument").ThrowAsJavaScriptException();
		return info.Env().Undefined();
	}
	if (info[0].IsBuffer()) {
		Napi::Buffer<char> inBuf = info[0].As<Napi::Buffer<char>>();

		int orientation = ORIENTATION_UNSPECIFIED;
		if (info.Length() > 1)
			orientation = info[1].As<Napi::Number>();
		size_t pgfsize = inBuf.Length();
		char *pgfbuf = inBuf.Data();

		size_t jpgsize=0, jpgwidth=0, jpgheight=0;
		char *jpgbuf = (char *) pgf2jpg ((unsigned char *)pgfbuf, pgfsize, orientation, &jpgsize, &jpgwidth, &jpgheight);

		Napi::Buffer<char> outBuf = Napi::Buffer<char>::New(env, jpgbuf, jpgsize, FreeJPGData);

		// Create a new JavaScript object
		Napi::Object outObj = Napi::Object::New(info.Env());

		// Set properties (keys can be strings or symbols)
		outObj.Set(Napi::String::New(env, "data"),   outBuf);
		outObj.Set(Napi::String::New(env, "type"),   Napi::String::New(env, "image/jpeg"));
		outObj.Set(Napi::String::New(env, "width"),  Napi::Number::New(env, jpgwidth));
		outObj.Set(Napi::String::New(env, "height"), Napi::Number::New(env, jpgheight));

		return outObj;
	}
	else {
		Napi::Error::New(env, "Expected a Buffer").ThrowAsJavaScriptException();
		return info.Env().Undefined();
	}

	return info.Env().Undefined();
}


Napi::Object Init(Napi::Env env, Napi::Object exports) {
	exports["pgf2jpg"] = Napi::Function::New(env, ConvertPFG2JPG);
	return exports;
}

NODE_API_MODULE(pgf2jpg, Init)
