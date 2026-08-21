cmake:
	cmake -S . -B ./build -G Ninja
	cmake --build ./build --parallel
	cmake --build ./build --target format
