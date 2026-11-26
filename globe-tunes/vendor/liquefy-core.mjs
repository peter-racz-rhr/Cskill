// src/math.ts
const clamp = (value, minimum = 0, maximum = 1) => {
	return Math.min(Math.max(value, minimum), maximum);
};
const lerp = (from, to, progress) => {
	return from + (to - from) * progress;
};
const mapRange = (value, inputMinimum, inputMaximum, outputMinimum, outputMaximum) => {
	if (inputMaximum === inputMinimum) return outputMinimum;
	const progress = (value - inputMinimum) / (inputMaximum - inputMinimum);
	return lerp(outputMinimum, outputMaximum, progress);
};
const hexToRgb = (hex) => {
	const normalized = hex.trim().replace("#", "");
	const expanded = normalized.length === 3 ? normalized.split("").map((character) => character + character).join("") : normalized;
	if (!/^[0-9a-f]{6}$/i.test(expanded)) return [
		.58,
		.78,
		1
	];
	return [
		Number.parseInt(expanded.slice(0, 2), 16) / 255,
		Number.parseInt(expanded.slice(2, 4), 16) / 255,
		Number.parseInt(expanded.slice(4, 6), 16) / 255
	];
};

// src/glass-merge-geometry.ts
const finite = (value, fallback) => value !== void 0 && Number.isFinite(value) ? value : fallback;
const prepareShape = (shape) => {
	const halfWidth = Math.max(0, finite(shape.width, 0) / 2);
	const halfHeight = Math.max(0, finite(shape.height, 0) / 2);
	const radius = clamp(finite(shape.radius, 0), 0, Math.min(halfWidth, halfHeight));
	const stretch = clamp(finite(shape.stretch, 1), .2, 5);
	const angle = (finite(shape.angle, 0) % 180 + 180) % 180;
	const x = finite(shape.x, 0);
	const y = finite(shape.y, 0);
	if (stretch === 1) return {
		a: 1,
		angle: 0,
		b: 0,
		d: 1,
		extentX: halfWidth,
		extentY: halfHeight,
		halfHeight,
		halfWidth,
		lipschitz: 1,
		radius,
		stretch,
		x,
		y
	};
	const turn = angle * Math.PI / 180;
	const c = Math.cos(turn);
	const s = Math.sin(turn);
	const forwardA = c * c * stretch + s * s / stretch;
	const forwardB = c * s * (stretch - 1 / stretch);
	const forwardD = s * s * stretch + c * c / stretch;
	return {
		a: c * c / stretch + s * s * stretch,
		angle,
		b: c * s * (1 / stretch - stretch),
		d: s * s / stretch + c * c * stretch,
		extentX: Math.abs(forwardA) * halfWidth + Math.abs(forwardB) * halfHeight,
		extentY: Math.abs(forwardB) * halfWidth + Math.abs(forwardD) * halfHeight,
		halfHeight,
		halfWidth,
		lipschitz: Math.min(stretch, 1 / stretch),
		radius,
		stretch,
		x,
		y
	};
};
/**
* Signed distance to a rounded rect, negative inside. A stretched shape is
* measured in its own unstretched frame and scaled back by the smaller axis,
* which keeps the outline exact and the distance a safe underestimate.
*/
const roundRectDistance = (px, py, shape) => {
	const dx = px - shape.x;
	const dy = py - shape.y;
	const lx = shape.a * dx + shape.b * dy;
	const ly = shape.b * dx + shape.d * dy;
	const qx = Math.abs(lx) - shape.halfWidth + shape.radius;
	const qy = Math.abs(ly) - shape.halfHeight + shape.radius;
	const ox = qx > 0 ? qx : 0;
	const oy = qy > 0 ? qy : 0;
	return (Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - shape.radius) * shape.lipschitz;
};
/**
* Quadratic smooth minimum. Two edges closer than `k / 2` bridge, and where
* shapes overlap the concave corner fills by up to `k / 4`.
*/
const smoothMin = (a, b, k) => {
	if (k <= 0) return Math.min(a, b);
	const h = Math.max(k - Math.abs(a - b), 0) / k;
	return Math.min(a, b) - h * h * k * .25;
};
/** The merged outline as a field, negative inside: every shape folded together with `smoothMin`. */
const mergedField = (shapes, spacing) => {
	const k = Math.max(0, spacing) * 2;
	return (px, py) => {
		if (shapes.length === 0) return 1;
		let distance = roundRectDistance(px, py, shapes[0]);
		for (let index = 1; index < shapes.length; index += 1) distance = smoothMin(distance, roundRectDistance(px, py, shapes[index]), k);
		return distance;
	};
};
/** The box the shapes reach into, grown by `pad` on every side. Null when there is nothing to draw. */
const shapeBounds = (shapes, pad) => {
	if (shapes.length === 0) return null;
	let left = Infinity;
	let top = Infinity;
	let right = -Infinity;
	let bottom = -Infinity;
	for (const shape of shapes) {
		left = Math.min(left, shape.x - shape.extentX);
		top = Math.min(top, shape.y - shape.extentY);
		right = Math.max(right, shape.x + shape.extentX);
		bottom = Math.max(bottom, shape.y + shape.extentY);
	}
	left = Math.floor(left - pad);
	top = Math.floor(top - pad);
	return {
		height: Math.ceil(bottom + pad) - top,
		width: Math.ceil(right + pad) - left,
		x: left,
		y: top
	};
};
/**
* Traces `sample < 0` over the box with marching squares, one sample every
* `step` pixels, and returns each closed loop as a flat `[x0, y0, x1, y1, …]`.
*
* Every crossing is keyed by the grid edge it sits on, so it is shared by
* exactly two segments and the loops can be walked without orientation
* tables. The ring of samples around the box is forced outside, so every
* loop closes. Loops nest for holes; drawn with `evenodd` they come out right.
*/
const traceContours = (box, step, sample) => {
	const columns = Math.ceil(box.width / step) + 2;
	const rows = Math.ceil(box.height / step) + 2;
	const originX = box.x - step;
	const originY = box.y - step;
	const stride = columns + 1;
	const values = new Float64Array(stride * (rows + 1));
	for (let row = 0; row <= rows; row += 1) for (let column = 0; column <= columns; column += 1) values[row * stride + column] = row === 0 || column === 0 || row === rows || column === columns ? 1 : sample(originX + column * step, originY + row * step);
	const xs = [];
	const ys = [];
	const pointByEdge = /* @__PURE__ */ new Map();
	const links = [];
	const point = (edgeKey, x, y) => {
		let index = pointByEdge.get(edgeKey);
		if (index === void 0) {
			index = xs.length;
			xs.push(x);
			ys.push(y);
			links.push([]);
			pointByEdge.set(edgeKey, index);
		}
		return index;
	};
	for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
		const v0 = values[row * stride + column];
		const v1 = values[row * stride + column + 1];
		const v2 = values[(row + 1) * stride + column + 1];
		const v3 = values[(row + 1) * stride + column];
		const corners = (v0 < 0 ? 8 : 0) | (v1 < 0 ? 4 : 0) | (v2 < 0 ? 2 : 0) | (v3 < 0 ? 1 : 0);
		if (corners === 0 || corners === 15) continue;
		const x = originX + column * step;
		const y = originY + row * step;
		const edge = (side) => {
			if (side === 0) return point((row * stride + column) * 2, x + step * (v0 / (v0 - v1)), y);
			if (side === 1) return point((row * stride + column + 1) * 2 + 1, x + step, y + step * (v1 / (v1 - v2)));
			if (side === 2) return point(((row + 1) * stride + column) * 2, x + step * (v3 / (v3 - v2)), y + step);
			return point((row * stride + column) * 2 + 1, x, y + step * (v0 / (v0 - v3)));
		};
		const segment = (from, to) => {
			const a = edge(from);
			const b = edge(to);
			links[a].push(b);
			links[b].push(a);
		};
		switch (corners) {
			case 1:
			case 14:
				segment(3, 2);
				break;
			case 2:
			case 13:
				segment(2, 1);
				break;
			case 3:
			case 12:
				segment(3, 1);
				break;
			case 4:
			case 11:
				segment(0, 1);
				break;
			case 6:
			case 9:
				segment(0, 2);
				break;
			case 7:
			case 8:
				segment(3, 0);
				break;
			case 5:
			case 10: {
				const centreInside = (v0 + v1 + v2 + v3) / 4 < 0;
				if (corners === 5 === centreInside) {
					segment(3, 0);
					segment(1, 2);
				} else {
					segment(0, 1);
					segment(3, 2);
				}
				break;
			}
		}
	}
	const visited = new Uint8Array(xs.length);
	const loops = [];
	for (let start = 0; start < xs.length; start += 1) {
		if (visited[start]) continue;
		const loop = [xs[start], ys[start]];
		visited[start] = 1;
		let previous = -1;
		let current = start;
		for (;;) {
			const next = links[current];
			const candidate = next[0] !== previous ? next[0] : next[1];
			if (candidate === void 0 || visited[candidate]) break;
			loop.push(xs[candidate], ys[candidate]);
			visited[candidate] = 1;
			previous = current;
			current = candidate;
		}
		loops.push(loop);
	}
	return loops;
};
/** Loops as SVG/CSS path data, one `M…Z` each, to one decimal. */
const contourPath = (loops) => {
	let path = "";
	for (const loop of loops) {
		for (let index = 0; index < loop.length; index += 2) path += `${index === 0 ? "M" : "L"}${loop[index].toFixed(1)} ${loop[index + 1].toFixed(1)}`;
		path += "Z";
	}
	return path;
};
const erf = (x) => {
	const sign = x < 0 ? -1 : 1;
	const z = Math.abs(x);
	const t = 1 / (1 + .3275911 * z);
	return sign * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-z * z));
};
const normalCdf = (z) => .5 * (1 + erf(z / Math.SQRT2));
/**
* A white disc of radius `discRadius` blurred by `sigma`, read `distance`
* from its centre. The blur is separable, so across x it is a difference of
* two normal CDFs and only the integral over y is left; `y = R sin θ` takes
* the square root out of it so Simpson's rule converges quickly.
*/
const blurredDiscAt = (discRadius, distance, sigma) => {
	if (discRadius <= 0) return 0;
	if (sigma <= 0) return distance < discRadius ? 1 : 0;
	const intervals = 64;
	const stepAngle = Math.PI / 2 / intervals;
	let sum = 0;
	for (let index = 0; index <= intervals; index += 1) {
		const theta = index * stepAngle;
		const y = discRadius * Math.sin(theta);
		const halfChord = discRadius * Math.cos(theta);
		const across = normalCdf((halfChord - distance) / sigma) - normalCdf((-halfChord - distance) / sigma);
		const density = Math.exp(-(y * y) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
		const weight = index === 0 || index === intervals ? 1 : index % 2 === 1 ? 4 : 2;
		sum += weight * density * across * halfChord;
	}
	return 2 * sum * stepAngle / 3;
};
const inflationCache = /* @__PURE__ */ new Map();
/**
* How much to grow a shape's sprite so that, once the sprites are blurred by
* `sigma` and cut at half, a lone shape with this corner radius keeps its
* size: a blurred disc cut at 0.5 comes out smaller than it went in.
*
* It is one number per shape, worked out for the corners. Straight sides
* erode far less, so a pill's flat sides end up about this much too far out.
*/
const gooInflation = (radius, sigma) => {
	if (sigma <= 0) return 0;
	const r = Math.max(0, Math.round(radius * 2) / 2);
	const key = `${r}:${sigma.toFixed(3)}`;
	const cached = inflationCache.get(key);
	if (cached !== void 0) return cached;
	let low = r;
	let high = r + sigma * 3;
	for (let iteration = 0; iteration < 32; iteration += 1) {
		const middle = (low + high) / 2;
		if (blurredDiscAt(middle, r, sigma) < .5) low = middle;
		else high = middle;
	}
	const growth = (low + high) / 2 - r;
	if (inflationCache.size > 512) inflationCache.clear();
	inflationCache.set(key, growth);
	return growth;
};
const STRETCH_STEP = .02;
const ANGLE_STEP = 3;
/** A circle's sprite is drawn at this radius and scaled to fit, so one image serves every size. */
const CIRCLE_UNITS = 32;
const round = (value, step) => Math.round(value / step) * step;
const format = (value) => String(Math.round(value * 100) / 100);
/**
* Stretch and angle snapped to the steps sprites are cached at. A stretch
* within half a step of none drops its angle, which then means nothing.
*/
const quantiseStretch = (stretch, angle) => {
	const k = Math.round(round(stretch, STRETCH_STEP) * 100) / 100;
	if (k === 1) return [1, 0];
	return [k, round(angle, ANGLE_STEP) % 180];
};
/**
* The sprite a shape needs, in the sprite's own units, and the key it is
* cached under. Position never matters. A circle scales uniformly, so one
* drawn at a fixed size serves every size and only its stretch is in the key.
* Anything else is keyed by its grown size to the pixel, which the blur after
* it cannot resolve anyway.
*/
const describeSprite = (shape, growth) => {
	const [stretch, angle] = quantiseStretch(shape.stretch, shape.angle);
	const width = shape.halfWidth * 2 + growth * 2;
	const height = shape.halfHeight * 2 + growth * 2;
	const radius = shape.radius + growth;
	if (Math.abs(width - height) < .5 && radius >= Math.min(width, height) / 2 - .25) return {
		angle,
		height: 64,
		key: `c:${stretch}:${angle}`,
		radius: CIRCLE_UNITS,
		scale: (width + height) / 4 / CIRCLE_UNITS,
		stretch,
		width: 64
	};
	const roundedWidth = Math.max(1, Math.round(width));
	const roundedHeight = Math.max(1, Math.round(height));
	const roundedRadius = Math.min(Math.round(radius * 2) / 2, roundedWidth / 2, roundedHeight / 2);
	return {
		angle,
		height: roundedHeight,
		key: `r:${roundedWidth}x${roundedHeight}:${roundedRadius}:${stretch}:${angle}`,
		radius: roundedRadius,
		scale: 1,
		stretch,
		width: roundedWidth
	};
};
const spriteCache = /* @__PURE__ */ new Map();
const buildSprite = ({ angle, height, key, radius, stretch, width }) => {
	const turn = angle * Math.PI / 180;
	const c = Math.cos(turn);
	const s = Math.sin(turn);
	const a = c * c * stretch + s * s / stretch;
	const b = c * s * (stretch - 1 / stretch);
	const d = s * s * stretch + c * c / stretch;
	const halfWidth = Math.ceil(Math.abs(a) * (width / 2) + Math.abs(b) * (height / 2)) + 1;
	const halfHeight = Math.ceil(Math.abs(b) * (width / 2) + Math.abs(d) * (height / 2)) + 1;
	const transform = stretch === 1 ? "" : ` transform="matrix(${format(a)} ${format(b)} ${format(b)} ${format(d)} 0 0)"`;
	const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${halfWidth * 2}" height="${halfHeight * 2}" viewBox="${-halfWidth} ${-halfHeight} ${halfWidth * 2} ${halfHeight * 2}"><rect x="${format(-width / 2)}" y="${format(-height / 2)}" width="${format(width)}" height="${format(height)}" rx="${format(radius)}"${transform} fill="#fff"/></svg>`;
	return {
		halfHeight,
		halfWidth,
		href: `data:image/svg+xml,${encodeURIComponent(markup)}`,
		key
	};
};
/**
* The sprite for a shape grown by `growth`: a white rounded rect as an SVG
* `data:` image, stretched if the shape is. Built once per key and cached,
* because every new image is a new SVG document for the browser to parse,
* while moving or scaling one already loaded is only an attribute write.
*/
const spriteFor = (shape, growth) => {
	const described = describeSprite(shape, growth);
	let sprite = spriteCache.get(described.key);
	if (!sprite) {
		sprite = buildSprite(described);
		if (spriteCache.size >= 256) spriteCache.delete(spriteCache.keys().next().value);
		spriteCache.set(described.key, sprite);
	}
	return {
		...sprite,
		scale: described.scale
	};
};
/** Below this a rounded rect keeps its one sprite: the corners would save too little of it. */
const SLICE_SAVING = .5;
/** A sprite placed so it covers its shape: centred on it, scaled by `scale`. */
const placeSprite = (sprite, x, y) => {
	const halfWidth = sprite.halfWidth * sprite.scale;
	const halfHeight = sprite.halfHeight * sprite.scale;
	return {
		height: halfHeight * 2,
		href: sprite.href,
		kind: "image",
		width: halfWidth * 2,
		x: x - halfWidth,
		y: y - halfHeight
	};
};
/**
* The pieces a shape grown by `growth` is drawn from. Chromium draws a filter
* input again for every primitive that reads it, and the lens reads its
* shapes along more than a dozen paths, so every image goes through the
* rasteriser that many times a frame — for a sheet the size of the screen,
* most of the frame. A rounded rect big enough for it to matter is cut
* instead into the cross of two rectangles, which cost next to nothing, and
* a disc at each corner, which is all of it that has to be an image. A
* circle, a stretched shape, or a small one with big corners stays one sprite.
*/
const shapeParts = (shape, growth) => {
	const [stretch] = quantiseStretch(shape.stretch, shape.angle);
	const width = shape.halfWidth * 2 + growth * 2;
	const height = shape.halfHeight * 2 + growth * 2;
	const radius = Math.min(shape.radius + growth, width / 2, height / 2);
	const whole = () => [placeSprite(spriteFor(shape, growth), shape.x, shape.y)];
	if (stretch !== 1) return whole();
	const insetX = width / 2 - radius;
	const insetY = height / 2 - radius;
	const columns = insetX > .5 ? [-insetX, insetX] : [0];
	const rows = insetY > .5 ? [-insetY, insetY] : [0];
	if (columns.length === 1 && rows.length === 1) return whole();
	const disc = radius >= .5 ? spriteFor(prepareShape({
		height: radius * 2,
		radius,
		width: radius * 2,
		x: 0,
		y: 0
	}), 0) : null;
	const discSide = disc ? disc.halfWidth * 2 * disc.scale : 0;
	if (columns.length * rows.length * discSide * discSide > width * height * SLICE_SAVING) return whole();
	const left = shape.x - width / 2;
	const top = shape.y - height / 2;
	if (!disc) return [{
		height,
		kind: "rect",
		width,
		x: left,
		y: top
	}];
	const parts = [];
	if (rows.length === 2) parts.push({
		height: height - radius * 2,
		kind: "rect",
		width,
		x: left,
		y: top + radius
	});
	if (columns.length === 2) parts.push({
		height,
		kind: "rect",
		width: width - radius * 2,
		x: left + radius,
		y: top
	});
	for (const row of rows) for (const column of columns) parts.push(placeSprite(disc, shape.x + column, shape.y + row));
	return parts;
};

// src/lens.ts
const maximumMapDimension = 640;
/**
* Exponent of the bezel cross-section. Tuned by measuring a rendered pill
* against a hard-edged backdrop: below this the rim reads as a soft vignette
* rather than glass, and above it the bend piles up against the rim and the
* rounded ends stop looking like one continuous surface.
*/
const defaultBezelCurve = 2;
/**
* Ceiling on how much the rim may squeeze the backdrop. Held below 1 so the
* sample mapping stays one-to-one, with the margin covering the extra scale the
* red channel carries when dispersion is on.
*/
const maximumCompression = .88;
const vertexShaderSource$1 = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
const fragmentShaderSource$1 = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_size;
uniform float u_radius;
uniform float u_bezel;
uniform float u_curve;

float sdRoundedRect(vec2 point, vec2 halfSize, float radius) {
  vec2 q = abs(point) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  vec2 pixel = vec2(v_uv.x, 1.0 - v_uv.y) * u_size;
  vec2 p = pixel - u_size * 0.5;
  vec2 halfSize = u_size * 0.5 - 0.5;
  float radius = min(u_radius, min(halfSize.x, halfSize.y));
  float d = sdRoundedRect(p, halfSize, radius);

  if (d > 0.0) {
    outColor = vec4(0.5, 0.5, 0.5, 1.0);
    return;
  }

  float t = clamp(1.0 + d / u_bezel, 0.0, 1.0);
  float profile = pow(t, u_curve);

  float epsilon = 1.0;
  vec2 gradient = vec2(
    sdRoundedRect(p + vec2(epsilon, 0.0), halfSize, radius) - sdRoundedRect(p - vec2(epsilon, 0.0), halfSize, radius),
    sdRoundedRect(p + vec2(0.0, epsilon), halfSize, radius) - sdRoundedRect(p - vec2(0.0, epsilon), halfSize, radius)
  );
  vec2 outwardNormal = gradient / max(length(gradient), 0.0001);

  vec2 displacement = -outwardNormal * profile;
  outColor = vec4(displacement * 0.5 + 0.5, 0.5, 1.0);
}
`;
let sharedContext;
const getLensContext = () => {
	if (sharedContext !== void 0) return sharedContext;
	if (typeof document === "undefined") {
		sharedContext = null;
		return sharedContext;
	}
	const canvas = document.createElement("canvas");
	const gl = canvas.getContext("webgl2", {
		alpha: false,
		antialias: false,
		depth: false,
		preserveDrawingBuffer: true,
		stencil: false
	});
	if (!gl) {
		sharedContext = null;
		return sharedContext;
	}
	const compile = (type, source) => {
		const shader = gl.createShader(type);
		if (!shader) return null;
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
		gl.deleteShader(shader);
		return null;
	};
	const vertexShader = compile(gl.VERTEX_SHADER, vertexShaderSource$1);
	const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentShaderSource$1);
	const program = vertexShader && fragmentShader ? gl.createProgram() : null;
	if (!vertexShader || !fragmentShader || !program) {
		sharedContext = null;
		return sharedContext;
	}
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	gl.deleteShader(vertexShader);
	gl.deleteShader(fragmentShader);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		gl.deleteProgram(program);
		sharedContext = null;
		return sharedContext;
	}
	gl.useProgram(program);
	const buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
		-1,
		-1,
		1,
		-1,
		-1,
		1,
		-1,
		1,
		1,
		-1,
		1,
		1
	]), gl.STATIC_DRAW);
	const position = gl.getAttribLocation(program, "a_position");
	gl.enableVertexAttribArray(position);
	gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
	sharedContext = {
		canvas,
		gl,
		uniforms: {
			bezel: gl.getUniformLocation(program, "u_bezel"),
			curve: gl.getUniformLocation(program, "u_curve"),
			radius: gl.getUniformLocation(program, "u_radius"),
			size: gl.getUniformLocation(program, "u_size")
		}
	};
	return sharedContext;
};
const isLensRenderingSupported = () => getLensContext() !== null;
const createLensMap = (options) => {
	const context = getLensContext();
	const width = Math.max(2, Math.round(options.width));
	const height = Math.max(2, Math.round(options.height));
	if (!context || width < 4 || height < 4) return null;
	const minimumSide = Math.min(width, height);
	const radius = clamp(options.radius, 0, minimumSide / 2);
	const bezel = clamp(options.bezel ?? Math.max(10, minimumSide * .22), 4, minimumSide / 2);
	const curve = clamp(options.curve ?? defaultBezelCurve, .5, 4);
	const maximumDisplacement = bezel * (clamp(options.strength ?? 1, 0, 1) * maximumCompression) / curve;
	const downscale = Math.min(1, maximumMapDimension / Math.max(width, height));
	const mapWidth = Math.max(4, Math.round(width * downscale));
	const mapHeight = Math.max(4, Math.round(height * downscale));
	const { canvas, gl, uniforms } = context;
	if (canvas.width !== mapWidth || canvas.height !== mapHeight) {
		canvas.width = mapWidth;
		canvas.height = mapHeight;
	}
	gl.viewport(0, 0, mapWidth, mapHeight);
	gl.uniform2f(uniforms.size, mapWidth, mapHeight);
	gl.uniform1f(uniforms.radius, radius * downscale);
	gl.uniform1f(uniforms.bezel, bezel * downscale);
	gl.uniform1f(uniforms.curve, curve);
	gl.drawArrays(gl.TRIANGLES, 0, 6);
	return {
		height,
		scale: maximumDisplacement * 2,
		url: canvas.toDataURL("image/png"),
		width
	};
};

// src/media.ts
/**
* Not every DOM implementation ships `matchMedia` — jsdom is the one you hit
* first, but any partial DOM counts. Reading a preference should never be the
* thing that throws, so an unavailable query reads as "no preference stated".
*/
const mediaQuery = (query) => typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query) : { matches: false };

// src/lens-filter.ts
const SVG_NS = "http://www.w3.org/2000/svg";
let filterCount = 0;
let defsRoot = null;
let lensSupport;
const isLensSupported = () => {
	if (lensSupport !== void 0) return lensSupport;
	if (typeof window === "undefined" || typeof CSS === "undefined" || typeof document === "undefined") return false;
	const parses = CSS.supports("backdrop-filter", "url(#lq-probe)") || CSS.supports("-webkit-backdrop-filter", "url(#lq-probe)");
	const chromium = "userAgentData" in navigator || "chrome" in window;
	lensSupport = parses && chromium;
	return lensSupport;
};
const getDefsRoot = () => {
	if (defsRoot?.isConnected) return defsRoot;
	defsRoot = document.createElementNS(SVG_NS, "svg");
	defsRoot.setAttribute("aria-hidden", "true");
	defsRoot.setAttribute("width", "0");
	defsRoot.setAttribute("height", "0");
	defsRoot.style.position = "absolute";
	defsRoot.style.overflow = "hidden";
	document.body.appendChild(defsRoot);
	return defsRoot;
};
const createElement = (tag, attributes) => {
	const element = document.createElementNS(SVG_NS, tag);
	for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
	return element;
};
const keepChannelMatrix = (channel) => {
	const passthrough = channel === 0 ? "1 0 0 0 0" : channel === 1 ? "0 1 0 0 0" : "0 0 1 0 0";
	const zero = "0 0 0 0 0";
	return [
		channel === 0 ? passthrough : zero,
		channel === 1 ? passthrough : zero,
		channel === 2 ? passthrough : zero,
		"0 0 0 1 0"
	].join(" ");
};
const attachLiquidLens = (element, options = {}) => {
	if (!isLensSupported()) return null;
	if (options.respectReducedTransparency === true && mediaQuery("(prefers-reduced-transparency: reduce)").matches) return null;
	const dispersion = clamp(options.dispersion ?? 0, 0, 1);
	const blur = clamp(options.blur ?? .6, 0, 24);
	const saturation = clamp(options.saturation ?? 1.24, 0, 3);
	const strength = clamp(options.strength ?? 1, 0, 1);
	const id = `lq-lens-${filterCount += 1}`;
	const filter = createElement("filter", {
		"color-interpolation-filters": "sRGB",
		filterUnits: "userSpaceOnUse",
		id,
		x: "0",
		y: "0"
	});
	const map = createElement("feImage", {
		preserveAspectRatio: "none",
		result: "lq-map",
		x: "0",
		y: "0"
	});
	filter.appendChild(map);
	const displacements = [];
	if (dispersion > 0) {
		const makeBranch = (channel) => {
			const displacement = createElement("feDisplacementMap", {
				in: "SourceGraphic",
				in2: "lq-map",
				result: `lq-d${channel}`,
				xChannelSelector: "R",
				yChannelSelector: "G"
			});
			const isolate = createElement("feColorMatrix", {
				in: `lq-d${channel}`,
				result: `lq-c${channel}`,
				type: "matrix",
				values: keepChannelMatrix(channel)
			});
			filter.appendChild(displacement);
			filter.appendChild(isolate);
			displacements.push(displacement);
			return `lq-c${channel}`;
		};
		const red = makeBranch(0);
		const green = makeBranch(1);
		const blue = makeBranch(2);
		filter.appendChild(createElement("feComposite", {
			in: red,
			in2: green,
			k1: "0",
			k2: "1",
			k3: "1",
			k4: "0",
			operator: "arithmetic",
			result: "lq-rg"
		}));
		filter.appendChild(createElement("feComposite", {
			in: "lq-rg",
			in2: blue,
			k1: "0",
			k2: "1",
			k3: "1",
			k4: "0",
			operator: "arithmetic",
			result: "lq-rgb"
		}));
	} else {
		const displacement = createElement("feDisplacementMap", {
			in: "SourceGraphic",
			in2: "lq-map",
			result: "lq-rgb",
			xChannelSelector: "R",
			yChannelSelector: "G"
		});
		filter.appendChild(displacement);
		displacements.push(displacement);
	}
	filter.appendChild(createElement("feGaussianBlur", {
		in: "lq-rgb",
		result: "lq-soft",
		stdDeviation: String(blur)
	}));
	filter.appendChild(createElement("feColorMatrix", {
		in: "lq-soft",
		type: "saturate",
		values: String(saturation)
	}));
	getDefsRoot().appendChild(filter);
	let destroyed = false;
	let refreshFrame = 0;
	const refresh = () => {
		if (destroyed || !element.isConnected) return;
		const width = element.offsetWidth;
		const height = element.offsetHeight;
		if (width < 8 || height < 8) return;
		const computed = getComputedStyle(element);
		const parsedRadius = Number.parseFloat(computed.borderTopLeftRadius);
		const radius = options.radius ?? (Number.isFinite(parsedRadius) ? parsedRadius : 16);
		const lensMap = createLensMap({
			bezel: options.bezel,
			curve: options.curve,
			height,
			radius,
			strength,
			width
		});
		if (!lensMap) return;
		filter.setAttribute("width", String(width));
		filter.setAttribute("height", String(height));
		map.setAttribute("width", String(width));
		map.setAttribute("height", String(height));
		map.setAttribute("href", lensMap.url);
		const spread = dispersion * .08;
		displacements.forEach((displacement, index) => {
			const factor = displacements.length === 3 ? 1 + spread * (1 - index) : 1;
			displacement.setAttribute("scale", String(lensMap.scale * factor));
		});
		element.style.setProperty("--lq-lens", `url(#${id})`);
		element.dataset.liquidLens = "true";
	};
	const scheduleRefresh = () => {
		cancelAnimationFrame(refreshFrame);
		refreshFrame = requestAnimationFrame(refresh);
	};
	const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleRefresh);
	resizeObserver?.observe(element);
	scheduleRefresh();
	return {
		destroy: () => {
			destroyed = true;
			cancelAnimationFrame(refreshFrame);
			resizeObserver?.disconnect();
			filter.remove();
			element.style.removeProperty("--lq-lens");
			delete element.dataset.liquidLens;
		},
		refresh: scheduleRefresh
	};
};

// src/glass-merge.ts
let mergeCount = 0;
/** Two straight edges blurred by σ and cut at half stop bridging at a gap of about 1.35σ. */
const SIGMA_PER_SPACING = 1 / 1.35;
/** How far the displacement map is allowed to swing off neutral at its steepest. */
const MAP_PEAK = .46;
/** The threshold that turns the blurred sprites into a crisp mask, centred on half. */
const SHARPNESS = 24;
/** Marching-squares step for the outline, in pixels. */
const GRID_STEP = 4;
const FROST = "blur(1.5px) saturate(1.4) brightness(1.05)";
const SOLID = "var(--lq-solid-fill, rgb(239, 244, 255))";
/** `.lq-button`'s cast shadow, `0 8px 20px`: a blur radius of 20px is a σ of 10. */
const SHADOW_BLUR = 10;
const SHADOW_DROP = 8;
/** `--lq-rim-width`. */
const RIM_WIDTH = 1.6;
/** A zero-sized shape still has a sprite the size of the blur, which would bulge its neighbours. */
const isVisible = (shape) => shape.halfWidth >= .25 && shape.halfHeight >= .25;
/** Sets inline properties and hands back a function that puts the previous values back. */
const setStyles = (element, styles) => {
	const previous = Object.keys(styles).map((name) => [
		name,
		element.style.getPropertyValue(name),
		element.style.getPropertyPriority(name)
	]);
	for (const [name, value] of Object.entries(styles)) element.style.setProperty(name, value);
	return () => {
		for (const [name, value, priority] of previous) if (value) element.style.setProperty(name, value, priority);
		else element.style.removeProperty(name);
	};
};
const observeSize = (element, onResize) => {
	if (typeof ResizeObserver === "undefined") return null;
	const observer = new ResizeObserver(onResize);
	observer.observe(element);
	return observer;
};
const primitives = (filter) => (tag, attributes, parent = filter) => {
	const child = createElement(tag, attributes);
	parent.appendChild(child);
	return child;
};
/**
* The filters live in a hidden `<svg>` inside the element rather than in one
* shared at the end of the body, so that their colours can be the theme's
* custom properties: a filter primitive inherits them like any element does,
* and follows a theme switch with no script.
*/
const filterHost = () => createElement("svg", {
	"aria-hidden": "true",
	height: "0",
	style: "position: absolute; width: 0; height: 0; overflow: hidden",
	width: "0"
});
/**
* What `.lq-button` dresses its glass in, drawn from the merged outline
* instead of a rectangle: the cast shadow, the lit ring of `.lq-surface__edge`,
* and the inset highlight along the top with its shade along the bottom.
* `mask` names the outline as an alpha mask. Returns the results to merge,
* the shadow first, so the glass can go between it and the rest.
*/
const addDressing = (add, mask) => {
	const shadowBlur = add("feGaussianBlur", {
		in: mask,
		result: "lq-shadow-blur",
		stdDeviation: String(SHADOW_BLUR)
	});
	add("feOffset", {
		dy: String(SHADOW_DROP),
		in: "lq-shadow-blur",
		result: "lq-shadow-drop"
	});
	add("feFlood", {
		result: "lq-shadow-color",
		style: "flood-color: var(--lq-shadow-color, rgba(4, 9, 24, 0.14)); flood-opacity: 0.4"
	});
	add("feComposite", {
		in: "lq-shadow-color",
		in2: "lq-shadow-drop",
		operator: "in",
		result: "lq-shadow-cast"
	});
	add("feComposite", {
		in: "lq-shadow-cast",
		in2: mask,
		operator: "out",
		result: "lq-shadow"
	});
	add("feMorphology", {
		in: mask,
		operator: "erode",
		radius: String(RIM_WIDTH),
		result: "lq-core"
	});
	add("feComposite", {
		in: mask,
		in2: "lq-core",
		operator: "out",
		result: "lq-ring"
	});
	add("feGaussianBlur", {
		in: mask,
		result: "lq-bevel",
		stdDeviation: "1.4"
	});
	add("feDistantLight", {
		azimuth: "225",
		elevation: "35"
	}, add("feDiffuseLighting", {
		diffuseConstant: "1",
		in: "lq-bevel",
		"lighting-color": "#fff",
		result: "lq-lit",
		surfaceScale: "3"
	}));
	add("feColorMatrix", {
		in: "lq-lit",
		result: "lq-facing",
		type: "matrix",
		values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.9 0 0 0 0.25"
	});
	add("feComposite", {
		in: "lq-facing",
		in2: "lq-ring",
		operator: "in",
		result: "lq-ring-lit"
	});
	add("feFlood", {
		result: "lq-rim-color",
		style: "flood-color: var(--lq-rim-bright, #fff)"
	});
	add("feComposite", {
		in: "lq-rim-color",
		in2: "lq-ring-lit",
		operator: "in",
		result: "lq-rim"
	});
	const inset = (dy, color, name) => {
		add("feOffset", {
			dy,
			in: mask,
			result: `lq-${name}-shift`
		});
		add("feComposite", {
			in: mask,
			in2: `lq-${name}-shift`,
			operator: "out",
			result: `lq-${name}-band`
		});
		add("feFlood", {
			result: `lq-${name}-color`,
			style: `flood-color: ${color}`
		});
		add("feComposite", {
			in: `lq-${name}-color`,
			in2: `lq-${name}-band`,
			operator: "in",
			result: `lq-${name}`
		});
	};
	inset("1", "var(--lq-glass-bright, rgba(255, 255, 255, 0.32))", "sheen");
	inset("-1", "var(--lq-glass-shade, rgba(73, 111, 209, 0.07))", "shade");
	return {
		edges: [
			"lq-rim",
			"lq-sheen",
			"lq-shade"
		],
		shadow: "lq-shadow",
		shadowBlur
	};
};
/**
* The lens built inside the filter. Each shape is an `feImage` sprite, or a
* big rounded rect two floods and four corner discs (see `shapeParts`); the
* pieces are merged, blurred and cut at half into one metaball mask; that
* mask blurred again is a height field whose slope is the displacement map;
* the backdrop is bent by it and cut to the mask, and the mask's edge gives
* the shadow, the rim and the inset lines. Script per frame is the pieces'
* attribute writes. Nothing is drawn on a canvas and nothing is encoded.
*
* What a frame costs is mostly the images, not the primitives: Chromium
* shares no result between the primitives that read it, so the pieces are
* drawn again down each of the fourteen paths that lead back to them — the
* four offsets of the height field, the cut, two for the shadow and seven for
* the rim and the lines. Primitives can be added freely; another reader of
* the mask, or of anything built from it, costs one more drawing of every
* image.
*/
const attachLens = (element, settings) => {
	const id = `lq-merge-${mergeCount += 1}`;
	const sigma = settings.spacing * SIGMA_PER_SPACING;
	const heightBlur = settings.bezel / 2;
	const maximumDisplacement = settings.bezel * .88 * settings.strength / 2;
	const filter = createElement("filter", {
		"color-interpolation-filters": "sRGB",
		filterUnits: "userSpaceOnUse",
		height: "0",
		id,
		primitiveUnits: "userSpaceOnUse",
		width: "0",
		x: "0",
		y: "0"
	});
	const add = primitives(filter);
	const merge = add("feMerge", { result: "lq-shapes" });
	add("feGaussianBlur", {
		in: "lq-shapes",
		result: "lq-potential",
		stdDeviation: sigma.toFixed(3)
	});
	add("feColorMatrix", {
		in: "lq-potential",
		result: "lq-mask",
		type: "matrix",
		values: `0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${SHARPNESS} ${.5 - SHARPNESS / 2}`
	});
	add("feGaussianBlur", {
		in: "lq-mask",
		result: "lq-height",
		stdDeviation: heightBlur.toFixed(3)
	});
	const step = 2;
	const steepest = 1 / (heightBlur * Math.sqrt(2 * Math.PI));
	const gain = (MAP_PEAK / (4 * steepest)).toFixed(4);
	const negativeGain = `-${gain}`;
	add("feOffset", {
		dx: String(step),
		in: "lq-height",
		result: "lq-left"
	});
	add("feOffset", {
		dx: String(-2),
		in: "lq-height",
		result: "lq-right"
	});
	add("feOffset", {
		dy: String(step),
		in: "lq-height",
		result: "lq-up"
	});
	add("feOffset", {
		dy: String(-2),
		in: "lq-height",
		result: "lq-down"
	});
	const arithmetic = (input, input2, k2, k3, k4, result) => add("feComposite", {
		in: input,
		in2: input2,
		k1: "0",
		k2,
		k3,
		k4,
		operator: "arithmetic",
		result
	});
	arithmetic("lq-right", "lq-left", gain, negativeGain, "0.5", "lq-slope-x");
	arithmetic("lq-down", "lq-up", gain, negativeGain, "0.5", "lq-slope-y");
	add("feColorMatrix", {
		in: "lq-slope-x",
		result: "lq-red",
		type: "matrix",
		values: "0 0 0 1 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1"
	});
	add("feColorMatrix", {
		in: "lq-slope-y",
		result: "lq-green",
		type: "matrix",
		values: "0 0 0 0 0  0 0 0 1 0  0 0 0 0 0.5  0 0 0 0 1"
	});
	arithmetic("lq-red", "lq-green", "1", "1", "0", "lq-map");
	add("feDisplacementMap", {
		in: "SourceGraphic",
		in2: "lq-map",
		result: "lq-bent",
		scale: (maximumDisplacement / MAP_PEAK).toFixed(3),
		xChannelSelector: "R",
		yChannelSelector: "G"
	});
	add("feGaussianBlur", {
		in: "lq-bent",
		result: "lq-soft",
		stdDeviation: "0.6"
	});
	add("feColorMatrix", {
		in: "lq-soft",
		result: "lq-lens",
		type: "saturate",
		values: "1.24"
	});
	add("feFlood", {
		"flood-color": settings.tint ?? "#fff",
		"flood-opacity": settings.tint ? "0.14" : "0.06",
		result: "lq-veil"
	});
	add("feComposite", {
		in: "lq-veil",
		in2: "lq-lens",
		operator: "over",
		result: "lq-lit"
	});
	add("feComposite", {
		in: "lq-lit",
		in2: "lq-mask",
		operator: "in",
		result: "lq-glass"
	});
	const dressing = addDressing(add, "lq-mask");
	const out = add("feMerge", {});
	for (const result of [
		dressing.shadow,
		"lq-glass",
		...dressing.edges
	]) add("feMergeNode", { in: result }, out);
	const host = filterHost();
	host.appendChild(filter);
	element.appendChild(host);
	const pools = {
		image: [],
		rect: []
	};
	const fill = (kind, count) => {
		const pool = pools[kind];
		while (pool.length < count) {
			const result = `lq-${kind === "image" ? "sprite" : "rect"}-${pool.length}`;
			const element = kind === "image" ? createElement("feImage", {
				preserveAspectRatio: "none",
				result
			}) : createElement("feFlood", {
				"flood-color": "#fff",
				result
			});
			filter.insertBefore(element, merge);
			pool.push({
				attributes: {},
				element,
				node: add("feMergeNode", { in: result }, merge)
			});
		}
		while (pool.length > count) {
			const slot = pool.pop();
			slot.element.remove();
			slot.node.remove();
		}
		return pool;
	};
	const write = (slot, name, value) => {
		if (slot.attributes[name] === value) return;
		slot.attributes[name] = value;
		slot.element.setAttribute(name, value);
	};
	dressing.shadowBlur.setAttribute("x", "0");
	dressing.shadowBlur.setAttribute("y", "0");
	const resize = () => {
		for (const target of [filter, dressing.shadowBlur]) {
			target.setAttribute("width", String(element.offsetWidth));
			target.setAttribute("height", String(element.offsetHeight));
		}
	};
	const resizeObserver = observeSize(element, resize);
	resize();
	const restoreStyles = setStyles(element, {
		"--lq-lens": `url(#${id})`,
		"-webkit-backdrop-filter": "var(--lq-lens)",
		"backdrop-filter": "var(--lq-lens)"
	});
	element.dataset.glassMerge = "lens";
	let destroyed = false;
	return {
		destroy: () => {
			if (destroyed) return;
			destroyed = true;
			resizeObserver?.disconnect();
			host.remove();
			restoreStyles();
			delete element.dataset.glassMerge;
		},
		mode: "lens",
		setShapes: (shapes) => {
			if (destroyed) return;
			const parts = shapes.map(prepareShape).filter(isVisible).flatMap((shape) => shapeParts(shape, gooInflation(shape.radius, sigma)));
			const images = fill("image", parts.filter((part) => part.kind === "image").length);
			const rects = fill("rect", parts.length - images.length);
			const ratio = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
			const snap = (value) => Math.round(value * ratio) / ratio;
			const place = (slot, x, y, width, height) => {
				write(slot, "x", x.toFixed(2));
				write(slot, "y", y.toFixed(2));
				write(slot, "width", width.toFixed(2));
				write(slot, "height", height.toFixed(2));
			};
			let image = 0;
			let rect = 0;
			for (const part of parts) if (part.kind === "image") {
				const slot = images[image++];
				write(slot, "href", part.href);
				place(slot, part.x, part.y, part.width, part.height);
			} else {
				const left = snap(part.x);
				const top = snap(part.y);
				place(rects[rect++], left, top, snap(part.x + part.width) - left, snap(part.y + part.height) - top);
			}
		}
	};
};
/** How far the dressing reaches past the outline: the shadow's blur and drop. */
const DRESSING_REACH = 40;
/**
* The outline for engines without the lens, and for less transparency: a
* layer clipped every frame to the merged outline, traced by marching squares
* over the smooth-min field, with the ordinary blurred material (or a solid
* fill), and the same shadow, ring and inset lines as the lens, made by the
* same filter from that contour.
*/
const attachOutline = (element, settings, opaque) => {
	const id = `lq-merge-${mergeCount += 1}`;
	const { tint } = settings;
	const fill = opaque ? tint ? `color-mix(in srgb, ${tint} 14%, ${SOLID})` : SOLID : tint ? `color-mix(in srgb, ${tint} 14%, transparent)` : "rgba(255, 255, 255, 0.06)";
	const restoreStyles = typeof getComputedStyle === "function" && getComputedStyle(element).position === "static" ? setStyles(element, { position: "relative" }) : () => {};
	element.dataset.glassMerge = "outline";
	const frost = document.createElement("div");
	frost.setAttribute("aria-hidden", "true");
	setStyles(frost, {
		"-webkit-backdrop-filter": opaque ? "none" : FROST,
		"backdrop-filter": opaque ? "none" : FROST,
		"background-color": fill,
		"clip-path": "inset(50%)",
		inset: "0",
		"pointer-events": "none",
		position: "absolute"
	});
	element.appendChild(frost);
	const dressing = createElement("svg", {
		"aria-hidden": "true",
		height: "100%",
		style: "position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none",
		width: "100%"
	});
	const defs = createElement("defs", {});
	dressing.appendChild(defs);
	const outline = createElement("path", {
		fill: "#fff",
		"fill-rule": "evenodd",
		id: `${id}-outline`
	});
	defs.appendChild(outline);
	const filter = createElement("filter", {
		"color-interpolation-filters": "sRGB",
		filterUnits: "userSpaceOnUse",
		height: "0",
		id: `${id}-dressing`,
		primitiveUnits: "userSpaceOnUse",
		width: "0",
		x: "0",
		y: "0"
	});
	defs.appendChild(filter);
	const add = primitives(filter);
	const results = addDressing(add, "SourceAlpha");
	const out = add("feMerge", {});
	for (const result of [results.shadow, ...results.edges]) add("feMergeNode", { in: result }, out);
	dressing.appendChild(createElement("use", {
		filter: `url(#${id}-dressing)`,
		href: `#${id}-outline`
	}));
	element.appendChild(dressing);
	let destroyed = false;
	return {
		destroy: () => {
			if (destroyed) return;
			destroyed = true;
			frost.remove();
			dressing.remove();
			restoreStyles();
			delete element.dataset.glassMerge;
		},
		mode: "outline",
		setShapes: (shapes) => {
			if (destroyed) return;
			const visible = shapes.map(prepareShape).filter(isVisible);
			const box = shapeBounds(visible, settings.spacing + GRID_STEP);
			const path = box ? contourPath(traceContours(box, GRID_STEP, mergedField(visible, settings.spacing))) : "";
			frost.style.setProperty("clip-path", path ? `path(evenodd, '${path}')` : "inset(50%)");
			outline.setAttribute("d", path);
			if (box) {
				filter.setAttribute("x", String(box.x - DRESSING_REACH));
				filter.setAttribute("y", String(box.y - DRESSING_REACH));
				filter.setAttribute("width", String(box.width + 80));
				filter.setAttribute("height", String(box.height + 80));
			}
		}
	};
};
/**
* Draws several glass shapes on one element so that they melt into each other
* when they come within `spacing` of one another, like SwiftUI's
* `GlassEffectContainer`. Shapes are given in the element's own pixels and can
* be replaced on every animation frame.
*
* Where SVG filters run inside `backdrop-filter` (Chromium) the whole lens —
* silhouette, refraction, rim and shadow — is built inside one filter.
* Elsewhere, or when the lens or transparency is turned off, a layer clipped
* to the merged outline holds a blurred or solid material, with the same rim
* and shadow over it. `mode` says which. The colours are the theme's: the
* rim, the inset lines and the shadow read `--lq-rim-bright`,
* `--lq-glass-bright`, `--lq-glass-shade` and `--lq-shadow-color`.
*
* The shadow falls up to 40px below the shapes and 30px to either side. In
* the lens it is part of the element's backdrop filter, which cannot draw
* outside the element, so leave the element that much room around them.
*
* The element draws nothing else: give it no background, border or shadow,
* and keep it out from under anything with `opacity`, `filter`, `clip-path`,
* `mask` or `will-change: opacity`, which would leave the glass nothing
* behind it to bend.
*/
const attachGlassMerge = (element, options = {}) => {
	const settings = {
		bezel: clamp(options.bezel ?? 14, 2, 64),
		spacing: clamp(options.spacing ?? 16, 0, 128),
		strength: clamp(options.strength ?? 1, 0, 1),
		tint: options.tint
	};
	const reducedTransparency = options.respectReducedTransparency === true && mediaQuery("(prefers-reduced-transparency: reduce)").matches;
	const opaque = options.transparency === false || reducedTransparency;
	return options.lens !== false && !opaque && isLensSupported() ? attachLens(element, settings) : attachOutline(element, settings, opaque);
};

// src/elastic.ts
const atRest = {
	offsetX: 0,
	offsetY: 0,
	stretchX: 0,
	stretchY: 0
};
/**
* How a surface leans toward a pointer that has not reached it yet.
*
* The falloff is measured from the element's *edge* rather than its centre, so
* a wide card starts to lean when the pointer nears its side instead of waiting
* for it to near the middle — which is what makes a dock of different-sized
* things respond as one row. Squaring it keeps the pull from switching on at
* the boundary of the reach.
*
* The stretch splits the lean between the two axes by the square of the
* direction, and takes half of it back on the other axis, so a surface pulled
* sideways goes wide and slightly flat instead of simply getting bigger.
*/
const elasticPull = (bounds, pointerX, pointerY, options = {}) => {
	const elasticity = clamp(options.elasticity ?? 0, 0, 1);
	const reach = Math.max(1, options.reach ?? 180);
	if (elasticity === 0 || bounds.width < 1 || bounds.height < 1) return atRest;
	const deltaX = pointerX - (bounds.left + bounds.width / 2);
	const deltaY = pointerY - (bounds.top + bounds.height / 2);
	const gapX = Math.max(0, Math.abs(deltaX) - bounds.width / 2);
	const gapY = Math.max(0, Math.abs(deltaY) - bounds.height / 2);
	const gap = Math.hypot(gapX, gapY);
	if (gap >= reach) return atRest;
	const falloff = (1 - gap / reach) ** 2;
	const distance = Math.hypot(deltaX, deltaY);
	if (distance < .001) return atRest;
	const directionX = deltaX / distance;
	const directionY = deltaY / distance;
	const lean = elasticity * falloff;
	const travel = Math.min(distance, reach) * lean;
	const axisX = directionX * directionX;
	const axisY = directionY * directionY;
	const stretch = lean * .4;
	return {
		offsetX: directionX * travel * .22,
		offsetY: directionY * travel * .22,
		stretchX: stretch * (axisX - axisY * .5),
		stretchY: stretch * (axisY - axisX * .5)
	};
};
const registrations = /* @__PURE__ */ new Set();
let listening = false;
let frame = 0;
let pointerX = 0;
let pointerY = 0;
let pointerSeen = false;
const invalidate = () => {
	for (const registration of registrations) registration.rect = null;
};
const dispatch = () => {
	frame = 0;
	for (const registration of registrations) {
		if (!registration.element.isConnected) continue;
		registration.rect ??= registration.element.getBoundingClientRect();
		registration.notify(registration.rect, pointerX, pointerY);
	}
};
const schedule = () => {
	if (frame) return;
	frame = requestAnimationFrame(dispatch);
};
const handlePointer = (event) => {
	pointerX = event.clientX;
	pointerY = event.clientY;
	pointerSeen = true;
	schedule();
};
const stopListening = () => {
	if (!listening) return;
	listening = false;
	cancelAnimationFrame(frame);
	frame = 0;
	window.removeEventListener("pointermove", handlePointer);
	window.removeEventListener("scroll", invalidate, true);
	window.removeEventListener("resize", invalidate);
};
/**
* Subscribes an element to the pointer, wherever the pointer is on the page.
*
* One window listener serves every surface, because the alternative — a
* listener per component — measures the same pointer dozens of times per move
* and lays out the whole page doing it. Rects are cached until something that
* can move them happens, and the fan-out runs on an animation frame, so a fast
* sweep across the page costs one measurement pass per frame no matter how many
* surfaces are mounted.
*/
const observeElasticPointer = (element, notify) => {
	if (typeof window === "undefined") return () => {};
	const registration = {
		element,
		notify,
		rect: null
	};
	registrations.add(registration);
	if (!listening) {
		listening = true;
		window.addEventListener("pointermove", handlePointer, { passive: true });
		window.addEventListener("scroll", invalidate, {
			capture: true,
			passive: true
		});
		window.addEventListener("resize", invalidate, { passive: true });
	}
	if (pointerSeen) schedule();
	return () => {
		registrations.delete(registration);
		if (registrations.size === 0) stopListening();
	};
};

// src/renderer.ts
const vertexShaderSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_resolution;
uniform float u_dpr;
uniform float u_radius;
uniform vec2 u_pointer;
uniform vec3 u_tint;
uniform float u_time;
uniform float u_active;
uniform float u_intensity;
uniform float u_wobble;
uniform vec2 u_stretch;
uniform vec4 u_ripple;
uniform float u_press;
// x glow, y ripple, z sparkle, w shimmer — each 0 or 1, so a surface can be
// stripped back to the plain refracting material one ornament at a time.
uniform vec4 u_ornaments;

const float TAU = 6.28318530718;

float sdRoundedRect(vec2 point, vec2 halfSize, float radius) {
  vec2 q = abs(point) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

vec3 iridescence(float phase) {
  return 0.5 + 0.5 * cos(TAU * (phase + vec3(0.0, 0.33, 0.67)));
}

void main() {
  vec2 sizePx = u_resolution / u_dpr;
  vec2 p = (v_uv - 0.5) * sizePx;
  float minSide = min(sizePx.x, sizePx.y);
  float radius = min(u_radius, minSide * 0.5);

  float angle = atan(p.y, p.x);
  float wobbleAmp = u_wobble * minSide * 0.05;
  float wobble = sin(angle * 3.0 + u_time * 15.0) * 0.62
    + sin(angle * 5.0 - u_time * 10.0 + 1.7) * 0.38;

  vec2 halfSize = sizePx * 0.5 - 1.0;
  halfSize *= vec2(1.0 + u_stretch.x * 0.4, 1.0 + u_stretch.y * 0.4);
  float d = sdRoundedRect(p, halfSize, radius) + wobble * wobbleAmp;
  float edgeDist = -d;

  float inside = smoothstep(0.9, -0.9, d);

  float rimWidth = 2.1 + u_active * 1.7 + u_press * 1.2;
  float rimR = exp(-pow(max(edgeDist - 0.4, 0.0) / (rimWidth * 1.3), 1.5));
  float rimG = exp(-pow(max(edgeDist - 1.0, 0.0) / rimWidth, 1.5));
  float rimB = exp(-pow(max(edgeDist - 1.7, 0.0) / (rimWidth * 0.85), 1.5));
  float topBias = smoothstep(-0.25, 0.95, v_uv.y);

  float bezelWidth = clamp(minSide * 0.16, 6.0, 26.0);
  float bezel = smoothstep(bezelWidth, 0.0, edgeDist) * (1.0 - max(max(rimR, rimG), rimB));

  vec2 pointerPx = (u_pointer - 0.5) * sizePx;
  float pointerDist = length(p - pointerPx);
  float glowSigma = minSide * 0.42 + 30.0 * u_active;
  float glow = exp(-pointerDist * pointerDist / (2.0 * glowSigma * glowSigma)) * u_active;
  float core = exp(-pointerDist * pointerDist / (2.0 * 240.0)) * u_active;

  float ripple = 0.0;
  if (u_ripple.w > 0.001) {
    vec2 ripplePx = (u_ripple.xy - 0.5) * sizePx;
    float rippleDist = length(p - ripplePx);
    float front = rippleDist - u_ripple.z * 320.0;
    float ringWidth = 11.0 + u_ripple.z * 46.0;
    float ring = exp(-front * front / (2.0 * ringWidth * ringWidth));
    ripple = ring * exp(-u_ripple.z * 3.4) * u_ripple.w;
  }

  float sheenAxis = p.x / sizePx.x * 0.55 - p.y / sizePx.y + 0.34 - (u_pointer.x - 0.5) * 0.22;
  float sheen = exp(-sheenAxis * sheenAxis * 30.0) * (0.05 + u_active * 0.1);

  float sparklePhase = sin((p.x + p.y * 1.3) * 0.11 + u_time * 1.1) * sin(p.x * 0.07 - u_time * 0.8);
  float sparkle = max(0.0, sparklePhase) * 0.05 * u_active;

  // Shimmer owns every bit of colour the material adds on its own: the cool
  // cast on the highlight and the red/green/blue split across the rim, as well
  // as the iridescent band. With it off the rim is one neutral line, so the
  // only hue on a surface is the tint it was given.
  vec3 white = mix(vec3(0.985), vec3(0.97, 0.985, 1.0), u_ornaments.w);
  vec3 rimTint = mix(u_tint * 0.8 + vec3(0.2), white, topBias);
  vec3 rim = mix(vec3(rimG), vec3(rimR, rimG, rimB), u_ornaments.w) * rimTint;
  vec3 shimmer = iridescence(angle / TAU + u_time * 0.04 + u_wobble * 0.3) * rimG * (0.08 + u_wobble * 0.16);

  float rimStrength = (0.38 + 0.62 * u_active + 0.45 * u_wobble) * u_intensity;

  vec3 color = vec3(0.0);
  color += rim * rimStrength;
  color += shimmer * u_intensity * u_ornaments.w;
  color += mix(white, u_tint, 0.35) * bezel * (0.015 + u_active * 0.02) * u_intensity;
  color += white * (glow * 0.13 + core * 0.22) * u_intensity * u_ornaments.x;
  color += (white * 0.75 + u_tint * 0.25) * ripple * 0.4 * u_intensity * u_ornaments.y;
  color += white * sheen * u_intensity;
  color += white * sparkle * u_intensity * u_ornaments.z;

  color *= inside;
  float alpha = clamp(max(color.r, max(color.g, color.b)), 0.0, 0.85);
  outColor = vec4(color, alpha);
}
`;
var SharedGlassContext = class SharedGlassContext {
	static instance;
	canvas;
	gl = null;
	program = null;
	uniforms = {};
	static get() {
		if (!SharedGlassContext.instance) SharedGlassContext.instance = new SharedGlassContext();
		return SharedGlassContext.instance;
	}
	constructor() {
		this.canvas = document.createElement("canvas");
		const gl = this.canvas.getContext("webgl2", {
			alpha: true,
			antialias: true,
			depth: false,
			premultipliedAlpha: true,
			preserveDrawingBuffer: true,
			stencil: false
		});
		if (!gl) return;
		const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
		if (!program) return;
		this.gl = gl;
		this.program = program;
		for (const name of [
			"active",
			"dpr",
			"intensity",
			"ornaments",
			"pointer",
			"press",
			"radius",
			"resolution",
			"ripple",
			"stretch",
			"time",
			"tint",
			"wobble"
		]) this.uniforms[name] = gl.getUniformLocation(program, `u_${name}`);
		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
			-1,
			-1,
			1,
			-1,
			-1,
			1,
			-1,
			1,
			1,
			-1,
			1,
			1
		]), gl.STATIC_DRAW);
		const position = gl.getAttribLocation(program, "a_position");
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.enable(gl.SCISSOR_TEST);
	}
	draw(state, wobble) {
		const gl = this.gl;
		if (!gl || !this.program) return false;
		if (this.canvas.width < state.width || this.canvas.height < state.height) {
			this.canvas.width = Math.max(this.canvas.width, state.width);
			this.canvas.height = Math.max(this.canvas.height, state.height);
		}
		gl.viewport(0, 0, state.width, state.height);
		gl.scissor(0, 0, state.width, state.height);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.useProgram(this.program);
		gl.uniform2f(this.uniforms.resolution ?? null, state.width, state.height);
		gl.uniform1f(this.uniforms.dpr ?? null, state.dpr);
		gl.uniform1f(this.uniforms.radius ?? null, state.radius);
		gl.uniform2f(this.uniforms.pointer ?? null, state.pointer[0], state.pointer[1]);
		gl.uniform3f(this.uniforms.tint ?? null, state.tint[0], state.tint[1], state.tint[2]);
		gl.uniform1f(this.uniforms.time ?? null, state.time);
		gl.uniform1f(this.uniforms.active ?? null, state.active);
		gl.uniform1f(this.uniforms.intensity ?? null, state.intensity);
		gl.uniform1f(this.uniforms.wobble ?? null, wobble);
		gl.uniform2f(this.uniforms.stretch ?? null, state.stretch[0], state.stretch[1]);
		gl.uniform1f(this.uniforms.press ?? null, state.press);
		gl.uniform4f(this.uniforms.ripple ?? null, state.ripple[0], state.ripple[1], state.ripple[2], state.ripple[3]);
		gl.uniform4f(this.uniforms.ornaments ?? null, state.ornaments[0], state.ornaments[1], state.ornaments[2], state.ornaments[3]);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		return true;
	}
};
var LiquidRenderer = class {
	canvas;
	active = 0;
	animationFrame = 0;
	blitContext = null;
	destroyed = false;
	hovering = false;
	intensity;
	lastTime = 0;
	ornaments;
	pointer = [.5, .5];
	press = 0;
	pressTarget = 0;
	radius;
	resizeObserver;
	rippleAge = -1;
	rippleOrigin = [.5, .5];
	rippleStrength = 0;
	stretch = [0, 0];
	supported = false;
	tint;
	wobble = 0;
	constructor(canvas, options = {}) {
		this.canvas = canvas;
		this.intensity = clamp(options.intensity ?? 1.2, 0, 1.4);
		this.ornaments = [
			options.glow === false ? 0 : 1,
			options.ripple === false ? 0 : 1,
			options.sparkle === false ? 0 : 1,
			options.shimmer === true ? 1 : 0
		];
		this.radius = options.radius ?? 16;
		this.tint = hexToRgb(options.tint ?? "#8f8f8f");
		this.resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => this.resize());
		this.supported = SharedGlassContext.get().gl !== null;
		this.blitContext = this.supported ? canvas.getContext("2d") : null;
		if (!this.supported || !this.blitContext) {
			this.supported = false;
			this.canvas.dataset.fallback = "true";
			return;
		}
		this.resizeObserver?.observe(this.canvas);
		this.resize();
		this.render(performance.now());
	}
	destroy() {
		this.destroyed = true;
		cancelAnimationFrame(this.animationFrame);
		this.resizeObserver?.disconnect();
	}
	isSupported() {
		return this.supported;
	}
	pulse(strength = 1) {
		this.ripple(this.pointer[0], 1 - this.pointer[1], strength);
	}
	ripple(x, y, strength = 1) {
		this.rippleOrigin = [clamp(x), clamp(1 - y)];
		this.rippleAge = 0;
		this.rippleStrength = clamp(strength, 0, 1.5);
		this.start();
	}
	setActive(active) {
		this.hovering = active;
		this.start();
	}
	setIntensity(intensity) {
		this.intensity = clamp(intensity, 0, 1.4);
		this.start();
	}
	setPointer(x, y) {
		this.pointer = [clamp(x), clamp(1 - y)];
		this.start();
	}
	setPress(pressed) {
		this.pressTarget = pressed ? 1 : 0;
		this.start();
	}
	setRadius(radius) {
		this.radius = Math.max(0, radius);
		this.start();
	}
	setStretch(x, y) {
		this.stretch = [clamp(x, -1, 1), clamp(y, -1, 1)];
	}
	setTint(tint) {
		this.tint = hexToRgb(tint);
		this.start();
	}
	setWobble(energy) {
		this.wobble = clamp(energy, 0, 1);
		if (this.wobble > .003) this.start();
	}
	get pixelRatio() {
		return Math.min(window.devicePixelRatio || 1, 2);
	}
	resize() {
		const width = Math.max(1, Math.round(this.canvas.clientWidth * this.pixelRatio));
		const height = Math.max(1, Math.round(this.canvas.clientHeight * this.pixelRatio));
		if (this.canvas.width === width && this.canvas.height === height) return;
		this.canvas.width = width;
		this.canvas.height = height;
		this.render(performance.now());
	}
	render(time) {
		if (!this.supported || this.destroyed || !this.blitContext) return;
		const shared = SharedGlassContext.get();
		const width = this.canvas.width;
		const height = this.canvas.height;
		if (!shared.draw({
			active: this.active,
			dpr: this.pixelRatio,
			height,
			intensity: this.intensity,
			ornaments: this.ornaments,
			pointer: this.pointer,
			press: this.press,
			radius: this.radius,
			ripple: [
				this.rippleOrigin[0],
				this.rippleOrigin[1],
				Math.max(this.rippleAge, 0),
				this.rippleAge >= 0 ? this.rippleStrength : 0
			],
			stretch: this.stretch,
			time: time / 1e3,
			tint: this.tint,
			width
		}, this.wobble)) return;
		this.blitContext.clearRect(0, 0, width, height);
		this.blitContext.drawImage(shared.canvas, 0, shared.canvas.height - height, width, height, 0, 0, width, height);
	}
	start() {
		if (this.animationFrame || this.destroyed || !this.supported) return;
		this.lastTime = performance.now();
		const tick = (time) => {
			const delta = Math.min((time - this.lastTime) / 1e3, .05);
			this.lastTime = time;
			const activeTarget = this.hovering ? 1 : 0;
			this.active += (activeTarget - this.active) * Math.min(1, delta * (this.hovering ? 9 : 4.5));
			this.press += (this.pressTarget - this.press) * Math.min(1, delta * 14);
			if (this.rippleAge >= 0) {
				this.rippleAge += delta;
				if (this.rippleAge > 1.4) this.rippleAge = -1;
			}
			this.render(time);
			if (!(Math.abs(this.active - activeTarget) < .004 && Math.abs(this.press - this.pressTarget) < .004 && this.rippleAge < 0 && this.wobble < .004 && !this.hovering)) {
				this.animationFrame = requestAnimationFrame(tick);
				return;
			}
			this.active = activeTarget;
			this.press = this.pressTarget;
			this.render(time);
			this.animationFrame = 0;
		};
		this.animationFrame = requestAnimationFrame(tick);
	}
};
const compileShader = (gl, type, source) => {
	const shader = gl.createShader(type);
	if (!shader) return null;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
	gl.deleteShader(shader);
	return null;
};
const createProgram = (gl, vertexSource, fragmentSource) => {
	const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
	const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
	if (!vertexShader || !fragmentShader) return null;
	const program = gl.createProgram();
	if (!program) return null;
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	gl.deleteShader(vertexShader);
	gl.deleteShader(fragmentShader);
	if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
	gl.deleteProgram(program);
	return null;
};

// src/spring.ts
var SpringValue = class {
	current;
	target;
	velocity = 0;
	damping;
	mass;
	stiffness;
	constructor(initialValue = 0, options = {}) {
		this.current = initialValue;
		this.target = initialValue;
		this.damping = options.damping ?? 21;
		this.mass = options.mass ?? 1;
		this.stiffness = options.stiffness ?? 210;
	}
	set(value) {
		this.current = value;
		this.target = value;
		this.velocity = 0;
	}
	setTarget(value) {
		this.target = value;
	}
	step(deltaSeconds) {
		const frameDelta = clampDelta(deltaSeconds);
		const stepCount = Math.max(1, Math.ceil(frameDelta / (1 / 120)));
		const delta = frameDelta / stepCount;
		for (let index = 0; index < stepCount; index += 1) {
			const displacement = this.current - this.target;
			const acceleration = (-this.stiffness * displacement + -this.damping * this.velocity) / this.mass;
			this.velocity += acceleration * delta;
			this.current += this.velocity * delta;
		}
		const remainingDistance = this.current - this.target;
		if (Math.abs(this.velocity) > .001 || Math.abs(remainingDistance) > .001) return true;
		this.current = this.target;
		this.velocity = 0;
		return false;
	}
};
const clampDelta = (deltaSeconds) => {
	if (!Number.isFinite(deltaSeconds)) return 1 / 60;
	return Math.min(Math.max(deltaSeconds, 1 / 240), 1 / 15);
};

// src/motion.ts
const readRadius = (element) => {
	const parsed = Number.parseFloat(getComputedStyle(element).borderTopLeftRadius);
	return Number.isFinite(parsed) ? parsed : 16;
};
const attachLiquidMotion = (element, canvas, options = {}) => {
	let disabled = options.disabled ?? false;
	let frame = 0;
	let lastTime = performance.now();
	let lastPointerTime = 0;
	let lastPointerX = 0;
	let lastPointerY = 0;
	let releaseTimeout = 0;
	const prefersReducedMotion = mediaQuery("(prefers-reduced-motion: reduce)");
	const reducedMotion = () => options.respectReducedMotion === true && prefersReducedMotion.matches;
	const wobbliness = clamp(options.wobbliness ?? .1, 0, 1.5);
	const bounce = clamp(options.bounce ?? .05, 0, .16);
	const tilt = clamp(options.tilt ?? 3.5, 0, 12);
	let boxWidth = 0;
	let boxHeight = 0;
	let pressed = false;
	const measure = () => {
		boxWidth = element.offsetWidth;
		boxHeight = element.offsetHeight;
	};
	const capScale = (value, extent) => {
		if (!(extent > 0)) return value;
		const limit = 12 / extent;
		return clamp(value, 1 - limit, 1 + limit);
	};
	const ownsPress = (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return true;
		const owner = target.closest("[data-liquid-motion]");
		return owner === null || owner === element;
	};
	const jellyDamping = 26 - wobbliness * 16.5;
	const pointerX = new SpringValue(.5, {
		damping: 30,
		stiffness: 320
	});
	const pointerY = new SpringValue(.5, {
		damping: 30,
		stiffness: 320
	});
	const scaleX = new SpringValue(1, {
		damping: jellyDamping,
		mass: .9,
		stiffness: 330
	});
	const scaleY = new SpringValue(1, {
		damping: jellyDamping,
		mass: .9,
		stiffness: 330
	});
	const skew = new SpringValue(0, {
		damping: jellyDamping * 1.15,
		mass: .9,
		stiffness: 260
	});
	const tiltX = new SpringValue(0, {
		damping: 13,
		stiffness: 190
	});
	const tiltY = new SpringValue(0, {
		damping: 13,
		stiffness: 190
	});
	const lift = new SpringValue(0, {
		damping: 20,
		mass: .8,
		stiffness: 230
	});
	const presence = new SpringValue(0, {
		damping: 24,
		stiffness: 210
	});
	const elasticity = clamp(options.elasticity ?? 0, 0, 1);
	const elasticX = new SpringValue(0, {
		damping: jellyDamping * 1.1,
		mass: 1.1,
		stiffness: 190
	});
	const elasticY = new SpringValue(0, {
		damping: jellyDamping * 1.1,
		mass: 1.1,
		stiffness: 190
	});
	const elasticStretchX = new SpringValue(0, {
		damping: jellyDamping,
		mass: 1,
		stiffness: 210
	});
	const elasticStretchY = new SpringValue(0, {
		damping: jellyDamping,
		mass: 1,
		stiffness: 210
	});
	const renderer = canvas && options.webgl !== false && !reducedMotion() ? new LiquidRenderer(canvas, {
		glow: options.glow,
		intensity: options.intensity,
		radius: readRadius(element),
		ripple: options.ripple,
		shimmer: options.shimmer,
		sparkle: options.sparkle,
		tint: options.tint
	}) : null;
	const inject = (spring, amount, cap) => {
		spring.velocity = clamp(spring.velocity + amount, -cap, cap);
	};
	const render = (time) => {
		const delta = (time - lastTime) / 1e3;
		lastTime = time;
		let moving = false;
		for (const spring of [
			pointerX,
			pointerY,
			scaleX,
			scaleY,
			skew,
			tiltX,
			tiltY,
			lift,
			presence,
			elasticX,
			elasticY,
			elasticStretchX,
			elasticStretchY
		]) if (spring.step(delta)) moving = true;
		const normalizedX = pointerX.current * 2 - 1;
		const normalizedY = pointerY.current * 2 - 1;
		const magnetStrength = presence.current * 1.65;
		const wobbleEnergy = clamp((Math.abs(scaleX.velocity) + Math.abs(scaleY.velocity)) * 1.4 + Math.abs(skew.velocity) * .04, 0, 1) * clamp(wobbliness, 0, 1);
		const squish = clamp((Math.abs(scaleX.current - 1) + Math.abs(scaleY.current - 1)) * 6, 0, 1);
		element.style.setProperty("--lq-pointer-x", `${(pointerX.current * 100).toFixed(3)}%`);
		element.style.setProperty("--lq-pointer-y", `${(pointerY.current * 100).toFixed(3)}%`);
		element.style.setProperty("--lq-rotate-x", `${tiltX.current.toFixed(3)}deg`);
		element.style.setProperty("--lq-rotate-y", `${tiltY.current.toFixed(3)}deg`);
		const appliedScaleX = capScale(scaleX.current * (1 + elasticStretchX.current), boxWidth);
		const appliedScaleY = capScale(scaleY.current * (1 + elasticStretchY.current), boxHeight);
		element.style.setProperty("--lq-scale-x", appliedScaleX.toFixed(4));
		element.style.setProperty("--lq-scale-y", appliedScaleY.toFixed(4));
		element.style.setProperty("--lq-elastic-x", `${elasticX.current.toFixed(3)}px`);
		element.style.setProperty("--lq-elastic-y", `${elasticY.current.toFixed(3)}px`);
		element.style.setProperty("--lq-edge-angle", `${(145 + normalizedX * 38 + normalizedY * 16).toFixed(2)}deg`);
		element.style.setProperty("--lq-skew-x", `${skew.current.toFixed(3)}deg`);
		element.style.setProperty("--lq-lift", `${lift.current.toFixed(3)}px`);
		element.style.setProperty("--lq-magnet-x", `${(normalizedX * magnetStrength).toFixed(3)}px`);
		element.style.setProperty("--lq-magnet-y", `${(normalizedY * magnetStrength).toFixed(3)}px`);
		element.style.setProperty("--lq-shine-opacity", presence.current.toFixed(4));
		element.style.setProperty("--lq-squish", squish.toFixed(4));
		if (renderer) {
			renderer.setPointer(pointerX.current, pointerY.current);
			renderer.setStretch(appliedScaleX - 1, appliedScaleY - 1);
			renderer.setWobble(wobbleEnergy);
		}
		if (moving) {
			frame = requestAnimationFrame(render);
			return;
		}
		frame = 0;
	};
	const start = () => {
		if (frame || reducedMotion()) return;
		lastTime = performance.now();
		frame = requestAnimationFrame(render);
	};
	const updatePointer = (event) => {
		if (disabled) return;
		const bounds = element.getBoundingClientRect();
		const width = Math.max(bounds.width, 1);
		const height = Math.max(bounds.height, 1);
		const localX = clamp((event.clientX - bounds.left) / width);
		const localY = clamp((event.clientY - bounds.top) / height);
		pointerX.setTarget(localX);
		pointerY.setTarget(localY);
		tiltX.setTarget(-(localY * 2 - 1) * tilt);
		tiltY.setTarget((localX * 2 - 1) * tilt);
		const now = event.timeStamp;
		if (lastPointerTime > 0 && now > lastPointerTime) {
			const deltaSeconds = Math.min((now - lastPointerTime) / 1e3, .05);
			const velocityX = (event.clientX - lastPointerX) / width / Math.max(deltaSeconds, .004);
			const velocityY = (event.clientY - lastPointerY) / height / Math.max(deltaSeconds, .004);
			inject(skew, velocityX * 3.4 * wobbliness, 42);
			inject(scaleX, Math.abs(velocityX) * .09 * wobbliness, 1.6);
			inject(scaleY, Math.abs(velocityY) * .09 * wobbliness, 1.6);
		}
		lastPointerTime = now;
		lastPointerX = event.clientX;
		lastPointerY = event.clientY;
		if (reducedMotion()) {
			pointerX.set(localX);
			pointerY.set(localY);
			element.style.setProperty("--lq-pointer-x", `${(localX * 100).toFixed(2)}%`);
			element.style.setProperty("--lq-pointer-y", `${(localY * 100).toFixed(2)}%`);
		}
		start();
	};
	const enter = (event) => {
		if (disabled) return;
		measure();
		element.dataset.liquidActive = "true";
		presence.setTarget(1);
		scaleX.setTarget(1.01);
		scaleY.setTarget(1.01);
		lift.setTarget(-1.5);
		lastPointerTime = 0;
		renderer?.setActive(true);
		renderer?.setRadius(readRadius(element));
		updatePointer(event);
	};
	const leave = () => {
		pressed = false;
		element.dataset.liquidActive = "false";
		pointerX.setTarget(.5);
		pointerY.setTarget(.5);
		scaleX.setTarget(1);
		scaleY.setTarget(1);
		skew.setTarget(0);
		tiltX.setTarget(0);
		tiltY.setTarget(0);
		lift.setTarget(0);
		presence.setTarget(0);
		lastPointerTime = 0;
		renderer?.setActive(false);
		renderer?.setPress(false);
		start();
	};
	const down = (event) => {
		if (disabled || !ownsPress(event)) return;
		measure();
		pressed = true;
		window.clearTimeout(releaseTimeout);
		scaleX.setTarget(1 + bounce * .55);
		scaleY.setTarget(1 - bounce * 1.15);
		skew.setTarget((pointerX.current * 2 - 1) * -2.4);
		lift.setTarget(1);
		renderer?.setPress(true);
		renderer?.ripple(pointerX.current, pointerY.current, .7);
		start();
	};
	const up = () => {
		if (!pressed) return;
		pressed = false;
		scaleX.setTarget(1.01);
		scaleY.setTarget(1.01);
		skew.setTarget(0);
		lift.setTarget(-2);
		inject(scaleY, bounce * (9 + wobbliness * 13), 4);
		inject(scaleX, -bounce * (5 + wobbliness * 7), 4);
		renderer?.setPress(false);
		renderer?.ripple(pointerX.current, pointerY.current, 1);
		start();
		releaseTimeout = window.setTimeout(() => {
			lift.setTarget(element.dataset.liquidActive === "true" ? -1.5 : 0);
			start();
		}, 140);
	};
	const releaseElastic = elasticity > 0 ? observeElasticPointer(element, (bounds, clientX, clientY) => {
		if (disabled || reducedMotion()) return;
		const pull = elasticPull(bounds, clientX, clientY, {
			elasticity,
			reach: options.reach
		});
		elasticX.setTarget(pull.offsetX);
		elasticY.setTarget(pull.offsetY);
		elasticStretchX.setTarget(pull.stretchX);
		elasticStretchY.setTarget(pull.stretchY);
		start();
	}) : null;
	measure();
	element.dataset.liquidMotion = "";
	element.addEventListener("pointerenter", enter);
	element.addEventListener("pointermove", updatePointer);
	element.addEventListener("pointerleave", leave);
	element.addEventListener("pointerdown", down);
	element.addEventListener("pointerup", up);
	element.addEventListener("pointercancel", leave);
	return {
		destroy: () => {
			cancelAnimationFrame(frame);
			window.clearTimeout(releaseTimeout);
			releaseElastic?.();
			renderer?.destroy();
			delete element.dataset.liquidMotion;
			element.removeEventListener("pointerenter", enter);
			element.removeEventListener("pointermove", updatePointer);
			element.removeEventListener("pointerleave", leave);
			element.removeEventListener("pointerdown", down);
			element.removeEventListener("pointerup", up);
			element.removeEventListener("pointercancel", leave);
		},
		pulse: (strength = 1) => {
			const pulseStrength = clamp(strength, 0, 1.5);
			renderer?.ripple(pointerX.current, pointerY.current, pulseStrength);
			inject(scaleY, bounce * pulseStrength * (8 + wobbliness * 10), 4);
			inject(scaleX, -bounce * pulseStrength * 5, 4);
			start();
		},
		setDisabled: (nextDisabled) => {
			disabled = nextDisabled;
			element.dataset.liquidDisabled = String(nextDisabled);
			if (nextDisabled) leave();
		}
	};
};

// src/tokens.ts
const defaultTokens = {
	accent: "#86a8ff",
	border: "rgba(255, 255, 255, 0.38)",
	duration: "420ms",
	easing: "cubic-bezier(0.22, 1, 0.36, 1)",
	radius: "28px",
	shadow: "0 18px 48px rgba(8, 12, 28, 0.18)",
	text: "#f7f9ff"
};

export { LiquidRenderer, SpringValue, attachGlassMerge, attachLiquidLens, attachLiquidMotion, clamp, createLensMap, defaultTokens, elasticPull, hexToRgb, isLensRenderingSupported, isLensSupported, lerp, mapRange, observeElasticPointer };
//# sourceMappingURL=index.mjs.map