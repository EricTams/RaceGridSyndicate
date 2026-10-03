// Banded "pixel" lighting and emissive materials, with screen-door fade.
// uOpacity<1: a 50% checkerboard (anything standing between the camera and a car). uFade: an ordered 4x4 dither
// that dissolves a surface gradually (0 gone, 1 solid), for scenery that fades out, like a freeway's far end.
'use strict';

const DITHER=`float bayer2(float x,float y){return mod(2.0*x+3.0*y,4.0);}
bool dithered(float fade){if(fade>=0.999)return false;vec2 p=mod(floor(gl_FragCoord.xy),4.0);
  float v=4.0*bayer2(mod(p.x,2.0),mod(p.y,2.0))+bayer2(floor(p.x/2.0),floor(p.y/2.0));return (v+0.5)/16.0>fade;}`;

const LIGHT=new THREE.Vector3(-0.6,1.0,0.5).normalize(); // view space: every sprite lit from upper-left
const VERT=`varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const FRAG_LIT=`uniform vec3 uColor;uniform vec3 uLight;uniform float uSteps;uniform float uOpacity;uniform float uFade;uniform float uFlash;uniform float uRim;uniform float uLift;varying vec3 vN;
${DITHER}
void main(){
  if(uOpacity<0.99&&mod(floor(gl_FragCoord.x)+floor(gl_FragCoord.y),2.0)<0.5)discard;
  if(dithered(uFade))discard;
  float t=clamp(dot(normalize(vN),uLight)*0.5+0.5,0.,1.);
  t=clamp(floor(t*uSteps)/(uSteps-1.),0.,1.);
  vec3 shadow=mix(uColor*mix(0.3,0.55,uLift),vec3(0.05,0.03,0.14),0.45*(1.-0.6*uLift));
  vec3 c=mix(shadow,uColor*mix(0.8,1.0,uLift),t);
  if(t>=0.999)c=mix(uColor,vec3(0.78,0.86,1.0),uRim);
  gl_FragColor=vec4(mix(c,vec3(1.),uFlash),1.);
}`;
const VERT_E=`void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const FRAG_E=`uniform vec3 uColor;uniform float uOpacity;uniform float uFade;
${DITHER}
void main(){if(uOpacity<0.99&&mod(floor(gl_FragCoord.x)+floor(gl_FragCoord.y),2.0)<0.5)discard;if(dithered(uFade))discard;gl_FragColor=vec4(uColor,1.);}`;
// lift (0-1) raises the darker bands toward the full colour: cars use it so team colours read at race zoom.
function litMat(hex,rim=0.35,side=THREE.FrontSide,lift=0){
  return new THREE.ShaderMaterial({vertexShader:VERT,fragmentShader:FRAG_LIT,side,uniforms:{
    uColor:{value:new THREE.Color(hex)},uLight:{value:LIGHT},uSteps:{value:3},uOpacity:{value:1},uFade:{value:1},uFlash:{value:0},uRim:{value:rim},uLift:{value:lift}}});
}
// Track edge lines: each vertex is pushed inward by uEdgeW, which the camera sets every view so the line
// is never thinner than about two screen pixels, however far the drone zooms out.
const EDGE_W={value:0.45};
const VERT_EDGE=`attribute vec3 inward;attribute float side;uniform float uEdgeW;
void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position+inward*side*uEdgeW,1.);}`;
function edgeMat(hex){
  return new THREE.ShaderMaterial({vertexShader:VERT_EDGE,fragmentShader:FRAG_E,side:THREE.DoubleSide,
    uniforms:{uColor:{value:new THREE.Color(hex)},uOpacity:{value:1},uFade:{value:1},uEdgeW:EDGE_W}});
}
function emitMat(hex,side=THREE.FrontSide){
  return new THREE.ShaderMaterial({vertexShader:VERT_E,fragmentShader:FRAG_E,side,uniforms:{uColor:{value:new THREE.Color(hex)},uOpacity:{value:1},uFade:{value:1}}});
}
