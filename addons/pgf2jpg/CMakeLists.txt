
cmake_minimum_required (VERSION 3.9)

set (CMAKE_CXX_STANDARD 17)

project (pgf2jpg
	VERSION 1.0.0
	DESCRIPTION "A PGF to JPG image converter"
)


set (PGF2JPG_SRC
	src/lib/pgf2jpg/pgf2jpg.cpp
)
set (LIBPGF_SRC
	src/lib/libpgf/Decoder.cpp
	src/lib/libpgf/Encoder.cpp
	src/lib/libpgf/PGFimage.cpp
	src/lib/libpgf/PGFstream.cpp
	src/lib/libpgf/Subband.cpp
	src/lib/libpgf/WaveletTransform.cpp
)
set (TOOJPEG_SRC
	src/lib/toojpeg/toojpeg.cpp
)
set (LIB_SRC ${PGF2JPG_SRC} ${LIBPGF_SRC} ${TOOJPEG_SRC})
set (LIB_INC src/lib/pgf2jpg src/lib/libpgf src/lib/toojpeg)

	
if (CLI)
	message( "Building Application..." )
	
	set (MAIN_SRC src/cli/pgf2jpg_cli.cpp)

	include_directories (${LIB_INC})
	add_executable (pgf2jpg ${MAIN_SRC} ${LIB_SRC})

else()
	message( "Building Node-Addon..." )
	
	# Include Node-API wrappers
	execute_process(COMMAND node -p "require('node-addon-api').include"
	        WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
	        OUTPUT_VARIABLE NODE_ADDON_API_DIR
	        )
	string(REGEX REPLACE "[\r\n\"]" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
	
	set (MAIN_SRC src/node/pgf2jpg_addon.cpp)
	include_directories(${LIB_INC} ${CMAKE_JS_INC})
	add_library(${PROJECT_NAME} SHARED ${ENTRY_SRC} ${MAIN_SRC} ${LIB_SRC} ${CMAKE_JS_SRC})

	set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")
	target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB})

	target_include_directories(${PROJECT_NAME} PRIVATE ${NODE_ADDON_API_DIR})
	
	# define NAPI_VERSION
	add_definitions(-DNAPI_VERSION=3)
        
endif ()

