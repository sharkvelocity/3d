precision highp float;

varying vec2 vUV;
uniform float time;

void main(void)
{
    // Simple moving flame pattern
    float flame = sin(vUV.y*10.0 + time*5.0) * 0.5 + 0.5;
    flame *= smoothstep(0.0, 0.2, vUV.y);
    vec3 color = mix(vec3(1.0,0.5,0.0), vec3(1.0,1.0,0.0), flame);
    gl_FragColor = vec4(color, 1.0);
}
