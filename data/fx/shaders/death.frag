precision highp float;

varying mediump vec2 v_uv;
varying mediump vec4 v_color;
varying mediump vec4 v_colorAdd;
uniform sampler2D u_texture;
uniform vec2 u_fboBufferSize;
uniform vec2 u_fboSize;
uniform sampler2D texture2;
uniform float param;
uniform vec4 fireColor;

void main()
{
	vec2 noiseSize = vec2(256, 256);
	
	float yMin = 1.2;
	float yMax = 1.0 - (u_fboSize.y / u_fboBufferSize.y) * 1.2;
	
	float yfire = (param * (yMax - yMin)) + yMin;
	
	vec2 coords = v_uv.xy;
	float yDelta = coords.y - yfire;
	
	vec2 noiseUV = (coords * 4.0) + vec2(yfire * 0.6, yfire * 2.0);
	
	vec4 noiseSample = texture2D(texture2, noiseUV);
		
	float yDelta2 = yDelta + noiseSample.g * 0.4 - 0.07;
	
	coords.y -= noiseSample.r * 1.6 * smoothstep(-0.05, 0.5, yDelta2);
	
	gl_FragColor = texture2D(u_texture, coords);
	
	float fade = smoothstep(0.05, 0.0, yDelta2);
	gl_FragColor.rgb *= min(1.0, yfire / 0.5) * fade;
	gl_FragColor.a *= fade;
	gl_FragColor.rgb += fireColor.rgb * smoothstep(-0.1, 0.05, yDelta2) * gl_FragColor.a;
}
