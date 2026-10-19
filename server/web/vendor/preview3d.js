"use strict";(()=>{var Zn={LEFT:0,MIDDLE:1,RIGHT:2,ROTATE:0,DOLLY:1,PAN:2},jn={ROTATE:0,PAN:1,DOLLY_PAN:2,DOLLY_ROTATE:3},Rl=0,so=1,Cl=2;var C0=1,Pl=2,mn=3,Dt=0,Tt=1,vt=2;var nn=0,yi=1,ro=2,ao=3,oo=4,Ll=5,_i=100,Il=101,Dl=102,lo=103,co=104,Ul=200,Ol=201,Nl=202,Fl=203,P0=204,L0=205,zl=206,Bl=207,kl=208,Vl=209,Hl=210,Gl=0,Wl=1,Xl=2,Jr=3,ql=4,Yl=5,Zl=6,jl=7,I0=0,Jl=1,$l=2,Tn=0,Kl=1,Ql=2,ec=3,tc=4,nc=5,D0=300,bi=301,Si=302,Wi=303,$r=304,$s=306,Kr=1e3,Zt=1001,Qr=1002,He=1003,ho=1004;var yr=1005;var zt=1006,ic=1007;var Xi=1008;var An=1009,sc=1010,rc=1011,Ia=1012,U0=1013,En=1014,tn=1015,Wn=1016,O0=1017,N0=1018,kn=1020,ac=1021,jt=1023,oc=1024,lc=1025,Vn=1026,wi=1027,cc=1028,F0=1029,hc=1030,z0=1031,B0=1033,vr=33776,Mr=33777,br=33778,Sr=33779,uo=35840,fo=35841,po=35842,mo=35843,uc=36196,go=37492,_o=37496,xo=37808,yo=37809,vo=37810,Mo=37811,bo=37812,So=37813,wo=37814,Eo=37815,To=37816,Ao=37817,Ro=37818,Co=37819,Po=37820,Lo=37821,wr=36492,Io=36494,Do=36495,dc=36283,Uo=36284,Oo=36285,No=36286;var Ps=2300,Ls=2301,Er=2302,Fo=2400,zo=2401,Bo=2402;var k0=3e3,Hn=3001,fc=3200,pc=3201,V0=0,mc=1,Gn="",Xe="srgb",sn="srgb-linear",Ks="display-p3";var Tr=7680;var gc=519,_c=512,xc=513,yc=514,vc=515,Mc=516,bc=517,Sc=518,wc=519,ea=35044;var ko="300 es",ta=1035,gn=2e3,Is=2001,rn=class{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){if(this._listeners===void 0)return!1;let n=this._listeners;return n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){if(this._listeners===void 0)return;let s=this._listeners[e];if(s!==void 0){let r=s.indexOf(t);r!==-1&&s.splice(r,1)}}dispatchEvent(e){if(this._listeners===void 0)return;let n=this._listeners[e.type];if(n!==void 0){e.target=this;let s=n.slice(0);for(let r=0,o=s.length;r<o;r++)s[r].call(this,e);e.target=null}}},gt=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],Vo=1234567,ki=Math.PI/180,qi=180/Math.PI;function _n(){let i=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(gt[i&255]+gt[i>>8&255]+gt[i>>16&255]+gt[i>>24&255]+"-"+gt[e&255]+gt[e>>8&255]+"-"+gt[e>>16&15|64]+gt[e>>24&255]+"-"+gt[t&63|128]+gt[t>>8&255]+"-"+gt[t>>16&255]+gt[t>>24&255]+gt[n&255]+gt[n>>8&255]+gt[n>>16&255]+gt[n>>24&255]).toLowerCase()}function xt(i,e,t){return Math.max(e,Math.min(t,i))}function Da(i,e){return(i%e+e)%e}function Ec(i,e,t,n,s){return n+(i-e)*(s-n)/(t-e)}function Tc(i,e,t){return i!==e?(t-i)/(e-i):0}function Vi(i,e,t){return(1-t)*i+t*e}function Ac(i,e,t,n){return Vi(i,e,1-Math.exp(-t*n))}function Rc(i,e=1){return e-Math.abs(Da(i,e*2)-e)}function Cc(i,e,t){return i<=e?0:i>=t?1:(i=(i-e)/(t-e),i*i*(3-2*i))}function Pc(i,e,t){return i<=e?0:i>=t?1:(i=(i-e)/(t-e),i*i*i*(i*(i*6-15)+10))}function Lc(i,e){return i+Math.floor(Math.random()*(e-i+1))}function Ic(i,e){return i+Math.random()*(e-i)}function Dc(i){return i*(.5-Math.random())}function Uc(i){i!==void 0&&(Vo=i);let e=Vo+=1831565813;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}function Oc(i){return i*ki}function Nc(i){return i*qi}function na(i){return(i&i-1)===0&&i!==0}function Fc(i){return Math.pow(2,Math.ceil(Math.log(i)/Math.LN2))}function Ds(i){return Math.pow(2,Math.floor(Math.log(i)/Math.LN2))}function zc(i,e,t,n,s){let r=Math.cos,o=Math.sin,a=r(t/2),l=o(t/2),c=r((e+n)/2),h=o((e+n)/2),d=r((e-n)/2),f=o((e-n)/2),m=r((n-e)/2),g=o((n-e)/2);switch(s){case"XYX":i.set(a*h,l*d,l*f,a*c);break;case"YZY":i.set(l*f,a*h,l*d,a*c);break;case"ZXZ":i.set(l*d,l*f,a*h,a*c);break;case"XZX":i.set(a*h,l*g,l*m,a*c);break;case"YXY":i.set(l*m,a*h,l*g,a*c);break;case"ZYZ":i.set(l*g,l*m,a*h,a*c);break;default:console.warn("THREE.MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+s)}}function en(i,e){switch(e.constructor){case Float32Array:return i;case Uint32Array:return i/4294967295;case Uint16Array:return i/65535;case Uint8Array:return i/255;case Int32Array:return Math.max(i/2147483647,-1);case Int16Array:return Math.max(i/32767,-1);case Int8Array:return Math.max(i/127,-1);default:throw new Error("Invalid component type.")}}function qe(i,e){switch(e.constructor){case Float32Array:return i;case Uint32Array:return Math.round(i*4294967295);case Uint16Array:return Math.round(i*65535);case Uint8Array:return Math.round(i*255);case Int32Array:return Math.round(i*2147483647);case Int16Array:return Math.round(i*32767);case Int8Array:return Math.round(i*127);default:throw new Error("Invalid component type.")}}var H0={DEG2RAD:ki,RAD2DEG:qi,generateUUID:_n,clamp:xt,euclideanModulo:Da,mapLinear:Ec,inverseLerp:Tc,lerp:Vi,damp:Ac,pingpong:Rc,smoothstep:Cc,smootherstep:Pc,randInt:Lc,randFloat:Ic,randFloatSpread:Dc,seededRandom:Uc,degToRad:Oc,radToDeg:Nc,isPowerOfTwo:na,ceilPowerOfTwo:Fc,floorPowerOfTwo:Ds,setQuaternionFromProperEuler:zc,normalize:qe,denormalize:en},me=class i{constructor(e=0,t=0){i.prototype.isVector2=!0,this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,n=this.y,s=e.elements;return this.x=s[0]*t+s[3]*n+s[6],this.y=s[1]*t+s[4]*n+s[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this}clampScalar(e,t){return this.x=Math.max(e,Math.min(t,this.x)),this.y=Math.max(e,Math.min(t,this.y)),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(e,Math.min(t,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(xt(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let n=Math.cos(t),s=Math.sin(t),r=this.x-e.x,o=this.y-e.y;return this.x=r*n-o*s+e.x,this.y=r*s+o*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},De=class i{constructor(e,t,n,s,r,o,a,l,c){i.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,n,s,r,o,a,l,c)}set(e,t,n,s,r,o,a,l,c){let h=this.elements;return h[0]=e,h[1]=s,h[2]=a,h[3]=t,h[4]=r,h[5]=l,h[6]=n,h[7]=o,h[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,s=t.elements,r=this.elements,o=n[0],a=n[3],l=n[6],c=n[1],h=n[4],d=n[7],f=n[2],m=n[5],g=n[8],_=s[0],p=s[3],u=s[6],S=s[1],y=s[4],R=s[7],w=s[2],P=s[5],T=s[8];return r[0]=o*_+a*S+l*w,r[3]=o*p+a*y+l*P,r[6]=o*u+a*R+l*T,r[1]=c*_+h*S+d*w,r[4]=c*p+h*y+d*P,r[7]=c*u+h*R+d*T,r[2]=f*_+m*S+g*w,r[5]=f*p+m*y+g*P,r[8]=f*u+m*R+g*T,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],o=e[4],a=e[5],l=e[6],c=e[7],h=e[8];return t*o*h-t*a*c-n*r*h+n*a*l+s*r*c-s*o*l}invert(){let e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],o=e[4],a=e[5],l=e[6],c=e[7],h=e[8],d=h*o-a*c,f=a*l-h*r,m=c*r-o*l,g=t*d+n*f+s*m;if(g===0)return this.set(0,0,0,0,0,0,0,0,0);let _=1/g;return e[0]=d*_,e[1]=(s*c-h*n)*_,e[2]=(a*n-s*o)*_,e[3]=f*_,e[4]=(h*t-s*l)*_,e[5]=(s*r-a*t)*_,e[6]=m*_,e[7]=(n*l-c*t)*_,e[8]=(o*t-n*r)*_,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,s,r,o,a){let l=Math.cos(r),c=Math.sin(r);return this.set(n*l,n*c,-n*(l*o+c*a)+o+e,-s*c,s*l,-s*(-c*o+l*a)+a+t,0,0,1),this}scale(e,t){return this.premultiply(Ar.makeScale(e,t)),this}rotate(e){return this.premultiply(Ar.makeRotation(-e)),this}translate(e,t){return this.premultiply(Ar.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){let t=this.elements,n=e.elements;for(let s=0;s<9;s++)if(t[s]!==n[s])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}},Ar=new De;function G0(i){for(let e=i.length-1;e>=0;--e)if(i[e]>=65535)return!0;return!1}function Us(i){return document.createElementNS("http://www.w3.org/1999/xhtml",i)}function Bc(){let i=Us("canvas");return i.style.display="block",i}var Ho={};function Hi(i){i in Ho||(Ho[i]=!0,console.warn(i))}function vi(i){return i<.04045?i*.0773993808:Math.pow(i*.9478672986+.0521327014,2.4)}function Rr(i){return i<.0031308?i*12.92:1.055*Math.pow(i,.41666)-.055}var kc=new De().fromArray([.8224621,.0331941,.0170827,.177538,.9668058,.0723974,-1e-7,1e-7,.9105199]),Vc=new De().fromArray([1.2249401,-.0420569,-.0196376,-.2249404,1.0420571,-.0786361,1e-7,0,1.0982735]);function Hc(i){return i.convertSRGBToLinear().applyMatrix3(Vc)}function Gc(i){return i.applyMatrix3(kc).convertLinearToSRGB()}var Wc={[sn]:i=>i,[Xe]:i=>i.convertSRGBToLinear(),[Ks]:Hc},Xc={[sn]:i=>i,[Xe]:i=>i.convertLinearToSRGB(),[Ks]:Gc},Lt={enabled:!0,get legacyMode(){return console.warn("THREE.ColorManagement: .legacyMode=false renamed to .enabled=true in r150."),!this.enabled},set legacyMode(i){console.warn("THREE.ColorManagement: .legacyMode=false renamed to .enabled=true in r150."),this.enabled=!i},get workingColorSpace(){return sn},set workingColorSpace(i){console.warn("THREE.ColorManagement: .workingColorSpace is readonly.")},convert:function(i,e,t){if(this.enabled===!1||e===t||!e||!t)return i;let n=Wc[e],s=Xc[t];if(n===void 0||s===void 0)throw new Error(`Unsupported color space conversion, "${e}" to "${t}".`);return s(n(i))},fromWorkingColorSpace:function(i,e){return this.convert(i,this.workingColorSpace,e)},toWorkingColorSpace:function(i,e){return this.convert(i,e,this.workingColorSpace)}},$n,Os=class{static getDataURL(e){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let t;if(e instanceof HTMLCanvasElement)t=e;else{$n===void 0&&($n=Us("canvas")),$n.width=e.width,$n.height=e.height;let n=$n.getContext("2d");e instanceof ImageData?n.putImageData(e,0,0):n.drawImage(e,0,0,e.width,e.height),t=$n}return t.width>2048||t.height>2048?(console.warn("THREE.ImageUtils.getDataURL: Image converted to jpg for performance reasons",e),t.toDataURL("image/jpeg",.6)):t.toDataURL("image/png")}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){let t=Us("canvas");t.width=e.width,t.height=e.height;let n=t.getContext("2d");n.drawImage(e,0,0,e.width,e.height);let s=n.getImageData(0,0,e.width,e.height),r=s.data;for(let o=0;o<r.length;o++)r[o]=vi(r[o]/255)*255;return n.putImageData(s,0,0),t}else if(e.data){let t=e.data.slice(0);for(let n=0;n<t.length;n++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[n]=Math.floor(vi(t[n]/255)*255):t[n]=vi(t[n]);return{data:t,width:e.width,height:e.height}}else return console.warn("THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}},qc=0,Ns=class{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:qc++}),this.uuid=_n(),this.data=e,this.version=0}set needsUpdate(e){e===!0&&this.version++}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let n={uuid:this.uuid,url:""},s=this.data;if(s!==null){let r;if(Array.isArray(s)){r=[];for(let o=0,a=s.length;o<a;o++)s[o].isDataTexture?r.push(Cr(s[o].image)):r.push(Cr(s[o]))}else r=Cr(s);n.url=r}return t||(e.images[this.uuid]=n),n}};function Cr(i){return typeof HTMLImageElement<"u"&&i instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&i instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&i instanceof ImageBitmap?Os.getDataURL(i):i.data?{data:Array.from(i.data),width:i.width,height:i.height,type:i.data.constructor.name}:(console.warn("THREE.Texture: Unable to serialize Texture."),{})}var Yc=0,ft=class i extends rn{constructor(e=i.DEFAULT_IMAGE,t=i.DEFAULT_MAPPING,n=Zt,s=Zt,r=zt,o=Xi,a=jt,l=An,c=i.DEFAULT_ANISOTROPY,h=Gn){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:Yc++}),this.uuid=_n(),this.name="",this.source=new Ns(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=n,this.wrapT=s,this.magFilter=r,this.minFilter=o,this.anisotropy=c,this.format=a,this.internalFormat=null,this.type=l,this.offset=new me(0,0),this.repeat=new me(1,1),this.center=new me(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new De,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,typeof h=="string"?this.colorSpace=h:(Hi("THREE.Texture: Property .encoding has been replaced by .colorSpace."),this.colorSpace=h===Hn?Xe:Gn),this.userData={},this.version=0,this.onUpdate=null,this.isRenderTargetTexture=!1,this.needsPMREMUpdate=!1}get image(){return this.source.data}set image(e=null){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let n={metadata:{version:4.6,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==D0)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case Kr:e.x=e.x-Math.floor(e.x);break;case Zt:e.x=e.x<0?0:1;break;case Qr:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case Kr:e.y=e.y-Math.floor(e.y);break;case Zt:e.y=e.y<0?0:1;break;case Qr:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}get encoding(){return Hi("THREE.Texture: Property .encoding has been replaced by .colorSpace."),this.colorSpace===Xe?Hn:k0}set encoding(e){Hi("THREE.Texture: Property .encoding has been replaced by .colorSpace."),this.colorSpace=e===Hn?Xe:Gn}};ft.DEFAULT_IMAGE=null;ft.DEFAULT_MAPPING=D0;ft.DEFAULT_ANISOTROPY=1;var Ke=class i{constructor(e=0,t=0,n=0,s=1){i.prototype.isVector4=!0,this.x=e,this.y=t,this.z=n,this.w=s}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,s){return this.x=e,this.y=t,this.z=n,this.w=s,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,n=this.y,s=this.z,r=this.w,o=e.elements;return this.x=o[0]*t+o[4]*n+o[8]*s+o[12]*r,this.y=o[1]*t+o[5]*n+o[9]*s+o[13]*r,this.z=o[2]*t+o[6]*n+o[10]*s+o[14]*r,this.w=o[3]*t+o[7]*n+o[11]*s+o[15]*r,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,s,r,l=e.elements,c=l[0],h=l[4],d=l[8],f=l[1],m=l[5],g=l[9],_=l[2],p=l[6],u=l[10];if(Math.abs(h-f)<.01&&Math.abs(d-_)<.01&&Math.abs(g-p)<.01){if(Math.abs(h+f)<.1&&Math.abs(d+_)<.1&&Math.abs(g+p)<.1&&Math.abs(c+m+u-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;let y=(c+1)/2,R=(m+1)/2,w=(u+1)/2,P=(h+f)/4,T=(d+_)/4,k=(g+p)/4;return y>R&&y>w?y<.01?(n=0,s=.707106781,r=.707106781):(n=Math.sqrt(y),s=P/n,r=T/n):R>w?R<.01?(n=.707106781,s=0,r=.707106781):(s=Math.sqrt(R),n=P/s,r=k/s):w<.01?(n=.707106781,s=.707106781,r=0):(r=Math.sqrt(w),n=T/r,s=k/r),this.set(n,s,r,t),this}let S=Math.sqrt((p-g)*(p-g)+(d-_)*(d-_)+(f-h)*(f-h));return Math.abs(S)<.001&&(S=1),this.x=(p-g)/S,this.y=(d-_)/S,this.z=(f-h)/S,this.w=Math.acos((c+m+u-1)/2),this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this.z=Math.max(e.z,Math.min(t.z,this.z)),this.w=Math.max(e.w,Math.min(t.w,this.w)),this}clampScalar(e,t){return this.x=Math.max(e,Math.min(t,this.x)),this.y=Math.max(e,Math.min(t,this.y)),this.z=Math.max(e,Math.min(t,this.z)),this.w=Math.max(e,Math.min(t,this.w)),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(e,Math.min(t,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},ia=class extends rn{constructor(e=1,t=1,n={}){super(),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=1,this.scissor=new Ke(0,0,e,t),this.scissorTest=!1,this.viewport=new Ke(0,0,e,t);let s={width:e,height:t,depth:1};n.encoding!==void 0&&(Hi("THREE.WebGLRenderTarget: option.encoding has been replaced by option.colorSpace."),n.colorSpace=n.encoding===Hn?Xe:Gn),this.texture=new ft(s,n.mapping,n.wrapS,n.wrapT,n.magFilter,n.minFilter,n.format,n.type,n.anisotropy,n.colorSpace),this.texture.isRenderTargetTexture=!0,this.texture.flipY=!1,this.texture.generateMipmaps=n.generateMipmaps!==void 0?n.generateMipmaps:!1,this.texture.internalFormat=n.internalFormat!==void 0?n.internalFormat:null,this.texture.minFilter=n.minFilter!==void 0?n.minFilter:zt,this.depthBuffer=n.depthBuffer!==void 0?n.depthBuffer:!0,this.stencilBuffer=n.stencilBuffer!==void 0?n.stencilBuffer:!1,this.depthTexture=n.depthTexture!==void 0?n.depthTexture:null,this.samples=n.samples!==void 0?n.samples:0}setSize(e,t,n=1){(this.width!==e||this.height!==t||this.depth!==n)&&(this.width=e,this.height=t,this.depth=n,this.texture.image.width=e,this.texture.image.height=t,this.texture.image.depth=n,this.dispose()),this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.texture=e.texture.clone(),this.texture.isRenderTargetTexture=!0;let t=Object.assign({},e.texture.image);return this.texture.source=new Ns(t),this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}},Ut=class extends ia{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}},Fs=class extends ft{constructor(e=null,t=1,n=1,s=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:s},this.magFilter=He,this.minFilter=He,this.wrapR=Zt,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var sa=class extends ft{constructor(e=null,t=1,n=1,s=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:s},this.magFilter=He,this.minFilter=He,this.wrapR=Zt,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var Jt=class{constructor(e=0,t=0,n=0,s=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=s}static slerpFlat(e,t,n,s,r,o,a){let l=n[s+0],c=n[s+1],h=n[s+2],d=n[s+3],f=r[o+0],m=r[o+1],g=r[o+2],_=r[o+3];if(a===0){e[t+0]=l,e[t+1]=c,e[t+2]=h,e[t+3]=d;return}if(a===1){e[t+0]=f,e[t+1]=m,e[t+2]=g,e[t+3]=_;return}if(d!==_||l!==f||c!==m||h!==g){let p=1-a,u=l*f+c*m+h*g+d*_,S=u>=0?1:-1,y=1-u*u;if(y>Number.EPSILON){let w=Math.sqrt(y),P=Math.atan2(w,u*S);p=Math.sin(p*P)/w,a=Math.sin(a*P)/w}let R=a*S;if(l=l*p+f*R,c=c*p+m*R,h=h*p+g*R,d=d*p+_*R,p===1-a){let w=1/Math.sqrt(l*l+c*c+h*h+d*d);l*=w,c*=w,h*=w,d*=w}}e[t]=l,e[t+1]=c,e[t+2]=h,e[t+3]=d}static multiplyQuaternionsFlat(e,t,n,s,r,o){let a=n[s],l=n[s+1],c=n[s+2],h=n[s+3],d=r[o],f=r[o+1],m=r[o+2],g=r[o+3];return e[t]=a*g+h*d+l*m-c*f,e[t+1]=l*g+h*f+c*d-a*m,e[t+2]=c*g+h*m+a*f-l*d,e[t+3]=h*g-a*d-l*f-c*m,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,s){return this._x=e,this._y=t,this._z=n,this._w=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t){let n=e._x,s=e._y,r=e._z,o=e._order,a=Math.cos,l=Math.sin,c=a(n/2),h=a(s/2),d=a(r/2),f=l(n/2),m=l(s/2),g=l(r/2);switch(o){case"XYZ":this._x=f*h*d+c*m*g,this._y=c*m*d-f*h*g,this._z=c*h*g+f*m*d,this._w=c*h*d-f*m*g;break;case"YXZ":this._x=f*h*d+c*m*g,this._y=c*m*d-f*h*g,this._z=c*h*g-f*m*d,this._w=c*h*d+f*m*g;break;case"ZXY":this._x=f*h*d-c*m*g,this._y=c*m*d+f*h*g,this._z=c*h*g+f*m*d,this._w=c*h*d-f*m*g;break;case"ZYX":this._x=f*h*d-c*m*g,this._y=c*m*d+f*h*g,this._z=c*h*g-f*m*d,this._w=c*h*d+f*m*g;break;case"YZX":this._x=f*h*d+c*m*g,this._y=c*m*d+f*h*g,this._z=c*h*g-f*m*d,this._w=c*h*d-f*m*g;break;case"XZY":this._x=f*h*d-c*m*g,this._y=c*m*d-f*h*g,this._z=c*h*g+f*m*d,this._w=c*h*d+f*m*g;break;default:console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: "+o)}return t!==!1&&this._onChangeCallback(),this}setFromAxisAngle(e,t){let n=t/2,s=Math.sin(n);return this._x=e.x*s,this._y=e.y*s,this._z=e.z*s,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,n=t[0],s=t[4],r=t[8],o=t[1],a=t[5],l=t[9],c=t[2],h=t[6],d=t[10],f=n+a+d;if(f>0){let m=.5/Math.sqrt(f+1);this._w=.25/m,this._x=(h-l)*m,this._y=(r-c)*m,this._z=(o-s)*m}else if(n>a&&n>d){let m=2*Math.sqrt(1+n-a-d);this._w=(h-l)/m,this._x=.25*m,this._y=(s+o)/m,this._z=(r+c)/m}else if(a>d){let m=2*Math.sqrt(1+a-n-d);this._w=(r-c)/m,this._x=(s+o)/m,this._y=.25*m,this._z=(l+h)/m}else{let m=2*Math.sqrt(1+d-n-a);this._w=(o-s)/m,this._x=(r+c)/m,this._y=(l+h)/m,this._z=.25*m}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<Number.EPSILON?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(xt(this.dot(e),-1,1)))}rotateTowards(e,t){let n=this.angleTo(e);if(n===0)return this;let s=Math.min(1,t/n);return this.slerp(e,s),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let n=e._x,s=e._y,r=e._z,o=e._w,a=t._x,l=t._y,c=t._z,h=t._w;return this._x=n*h+o*a+s*c-r*l,this._y=s*h+o*l+r*a-n*c,this._z=r*h+o*c+n*l-s*a,this._w=o*h-n*a-s*l-r*c,this._onChangeCallback(),this}slerp(e,t){if(t===0)return this;if(t===1)return this.copy(e);let n=this._x,s=this._y,r=this._z,o=this._w,a=o*e._w+n*e._x+s*e._y+r*e._z;if(a<0?(this._w=-e._w,this._x=-e._x,this._y=-e._y,this._z=-e._z,a=-a):this.copy(e),a>=1)return this._w=o,this._x=n,this._y=s,this._z=r,this;let l=1-a*a;if(l<=Number.EPSILON){let m=1-t;return this._w=m*o+t*this._w,this._x=m*n+t*this._x,this._y=m*s+t*this._y,this._z=m*r+t*this._z,this.normalize(),this._onChangeCallback(),this}let c=Math.sqrt(l),h=Math.atan2(c,a),d=Math.sin((1-t)*h)/c,f=Math.sin(t*h)/c;return this._w=o*d+this._w*f,this._x=n*d+this._x*f,this._y=s*d+this._y*f,this._z=r*d+this._z*f,this._onChangeCallback(),this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){let e=Math.random(),t=Math.sqrt(1-e),n=Math.sqrt(e),s=2*Math.PI*Math.random(),r=2*Math.PI*Math.random();return this.set(t*Math.cos(s),n*Math.sin(r),n*Math.cos(r),t*Math.sin(s))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},L=class i{constructor(e=0,t=0,n=0){i.prototype.isVector3=!0,this.x=e,this.y=t,this.z=n}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(Go.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(Go.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,n=this.y,s=this.z,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6]*s,this.y=r[1]*t+r[4]*n+r[7]*s,this.z=r[2]*t+r[5]*n+r[8]*s,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,n=this.y,s=this.z,r=e.elements,o=1/(r[3]*t+r[7]*n+r[11]*s+r[15]);return this.x=(r[0]*t+r[4]*n+r[8]*s+r[12])*o,this.y=(r[1]*t+r[5]*n+r[9]*s+r[13])*o,this.z=(r[2]*t+r[6]*n+r[10]*s+r[14])*o,this}applyQuaternion(e){let t=this.x,n=this.y,s=this.z,r=e.x,o=e.y,a=e.z,l=e.w,c=l*t+o*s-a*n,h=l*n+a*t-r*s,d=l*s+r*n-o*t,f=-r*t-o*n-a*s;return this.x=c*l+f*-r+h*-a-d*-o,this.y=h*l+f*-o+d*-r-c*-a,this.z=d*l+f*-a+c*-o-h*-r,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,n=this.y,s=this.z,r=e.elements;return this.x=r[0]*t+r[4]*n+r[8]*s,this.y=r[1]*t+r[5]*n+r[9]*s,this.z=r[2]*t+r[6]*n+r[10]*s,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this.z=Math.max(e.z,Math.min(t.z,this.z)),this}clampScalar(e,t){return this.x=Math.max(e,Math.min(t,this.x)),this.y=Math.max(e,Math.min(t,this.y)),this.z=Math.max(e,Math.min(t,this.z)),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(e,Math.min(t,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){let n=e.x,s=e.y,r=e.z,o=t.x,a=t.y,l=t.z;return this.x=s*l-r*a,this.y=r*o-n*l,this.z=n*a-s*o,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return Pr.copy(this).projectOnVector(e),this.sub(Pr)}reflect(e){return this.sub(Pr.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(xt(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y,s=this.z-e.z;return t*t+n*n+s*s}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){let s=Math.sin(t)*e;return this.x=s*Math.sin(n),this.y=Math.cos(t)*e,this.z=s*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),s=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=s,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let e=(Math.random()-.5)*2,t=Math.random()*Math.PI*2,n=Math.sqrt(1-e**2);return this.x=n*Math.cos(t),this.y=n*Math.sin(t),this.z=e,this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},Pr=new L,Go=new Jt,Xn=class{constructor(e=new L(1/0,1/0,1/0),t=new L(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(hn.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(hn.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let n=hn.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){if(e.updateWorldMatrix(!1,!1),e.boundingBox!==void 0)e.boundingBox===null&&e.computeBoundingBox(),Kn.copy(e.boundingBox),Kn.applyMatrix4(e.matrixWorld),this.union(Kn);else{let s=e.geometry;if(s!==void 0)if(t&&s.attributes!==void 0&&s.attributes.position!==void 0){let r=s.attributes.position;for(let o=0,a=r.count;o<a;o++)hn.fromBufferAttribute(r,o).applyMatrix4(e.matrixWorld),this.expandByPoint(hn)}else s.boundingBox===null&&s.computeBoundingBox(),Kn.copy(s.boundingBox),Kn.applyMatrix4(e.matrixWorld),this.union(Kn)}let n=e.children;for(let s=0,r=n.length;s<r;s++)this.expandByObject(n[s],t);return this}containsPoint(e){return!(e.x<this.min.x||e.x>this.max.x||e.y<this.min.y||e.y>this.max.y||e.z<this.min.z||e.z>this.max.z)}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return!(e.max.x<this.min.x||e.min.x>this.max.x||e.max.y<this.min.y||e.min.y>this.max.y||e.max.z<this.min.z||e.min.z>this.max.z)}intersectsSphere(e){return this.clampPoint(e.center,hn),hn.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(Li),as.subVectors(this.max,Li),Qn.subVectors(e.a,Li),ei.subVectors(e.b,Li),ti.subVectors(e.c,Li),vn.subVectors(ei,Qn),Mn.subVectors(ti,ei),Dn.subVectors(Qn,ti);let t=[0,-vn.z,vn.y,0,-Mn.z,Mn.y,0,-Dn.z,Dn.y,vn.z,0,-vn.x,Mn.z,0,-Mn.x,Dn.z,0,-Dn.x,-vn.y,vn.x,0,-Mn.y,Mn.x,0,-Dn.y,Dn.x,0];return!Lr(t,Qn,ei,ti,as)||(t=[1,0,0,0,1,0,0,0,1],!Lr(t,Qn,ei,ti,as))?!1:(os.crossVectors(vn,Mn),t=[os.x,os.y,os.z],Lr(t,Qn,ei,ti,as))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,hn).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(hn).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(cn[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),cn[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),cn[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),cn[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),cn[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),cn[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),cn[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),cn[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(cn),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}},cn=[new L,new L,new L,new L,new L,new L,new L,new L],hn=new L,Kn=new Xn,Qn=new L,ei=new L,ti=new L,vn=new L,Mn=new L,Dn=new L,Li=new L,as=new L,os=new L,Un=new L;function Lr(i,e,t,n,s){for(let r=0,o=i.length-3;r<=o;r+=3){Un.fromArray(i,r);let a=s.x*Math.abs(Un.x)+s.y*Math.abs(Un.y)+s.z*Math.abs(Un.z),l=e.dot(Un),c=t.dot(Un),h=n.dot(Un);if(Math.max(-Math.max(l,c,h),Math.min(l,c,h))>a)return!1}return!0}var Zc=new Xn,Ii=new L,Ir=new L,Yi=class{constructor(e=new L,t=-1){this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let n=this.center;t!==void 0?n.copy(t):Zc.setFromPoints(e).getCenter(n);let s=0;for(let r=0,o=e.length;r<o;r++)s=Math.max(s,n.distanceToSquared(e[r]));return this.radius=Math.sqrt(s),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;Ii.subVectors(e,this.center);let t=Ii.lengthSq();if(t>this.radius*this.radius){let n=Math.sqrt(t),s=(n-this.radius)*.5;this.center.addScaledVector(Ii,s/n),this.radius+=s}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(Ir.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(Ii.copy(e.center).add(Ir)),this.expandByPoint(Ii.copy(e.center).sub(Ir))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}},un=new L,Dr=new L,ls=new L,bn=new L,Ur=new L,cs=new L,Or=new L,Zi=class{constructor(e=new L,t=new L(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,un)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=un.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(un.copy(this.origin).addScaledVector(this.direction,t),un.distanceToSquared(e))}distanceSqToSegment(e,t,n,s){Dr.copy(e).add(t).multiplyScalar(.5),ls.copy(t).sub(e).normalize(),bn.copy(this.origin).sub(Dr);let r=e.distanceTo(t)*.5,o=-this.direction.dot(ls),a=bn.dot(this.direction),l=-bn.dot(ls),c=bn.lengthSq(),h=Math.abs(1-o*o),d,f,m,g;if(h>0)if(d=o*l-a,f=o*a-l,g=r*h,d>=0)if(f>=-g)if(f<=g){let _=1/h;d*=_,f*=_,m=d*(d+o*f+2*a)+f*(o*d+f+2*l)+c}else f=r,d=Math.max(0,-(o*f+a)),m=-d*d+f*(f+2*l)+c;else f=-r,d=Math.max(0,-(o*f+a)),m=-d*d+f*(f+2*l)+c;else f<=-g?(d=Math.max(0,-(-o*r+a)),f=d>0?-r:Math.min(Math.max(-r,-l),r),m=-d*d+f*(f+2*l)+c):f<=g?(d=0,f=Math.min(Math.max(-r,-l),r),m=f*(f+2*l)+c):(d=Math.max(0,-(o*r+a)),f=d>0?r:Math.min(Math.max(-r,-l),r),m=-d*d+f*(f+2*l)+c);else f=o>0?-r:r,d=Math.max(0,-(o*f+a)),m=-d*d+f*(f+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,d),s&&s.copy(Dr).addScaledVector(ls,f),m}intersectSphere(e,t){un.subVectors(e.center,this.origin);let n=un.dot(this.direction),s=un.dot(un)-n*n,r=e.radius*e.radius;if(s>r)return null;let o=Math.sqrt(r-s),a=n-o,l=n+o;return l<0?null:a<0?this.at(l,t):this.at(a,t)}intersectsSphere(e){return this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){let n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,s,r,o,a,l,c=1/this.direction.x,h=1/this.direction.y,d=1/this.direction.z,f=this.origin;return c>=0?(n=(e.min.x-f.x)*c,s=(e.max.x-f.x)*c):(n=(e.max.x-f.x)*c,s=(e.min.x-f.x)*c),h>=0?(r=(e.min.y-f.y)*h,o=(e.max.y-f.y)*h):(r=(e.max.y-f.y)*h,o=(e.min.y-f.y)*h),n>o||r>s||((r>n||isNaN(n))&&(n=r),(o<s||isNaN(s))&&(s=o),d>=0?(a=(e.min.z-f.z)*d,l=(e.max.z-f.z)*d):(a=(e.max.z-f.z)*d,l=(e.min.z-f.z)*d),n>l||a>s)||((a>n||n!==n)&&(n=a),(l<s||s!==s)&&(s=l),s<0)?null:this.at(n>=0?n:s,t)}intersectsBox(e){return this.intersectBox(e,un)!==null}intersectTriangle(e,t,n,s,r){Ur.subVectors(t,e),cs.subVectors(n,e),Or.crossVectors(Ur,cs);let o=this.direction.dot(Or),a;if(o>0){if(s)return null;a=1}else if(o<0)a=-1,o=-o;else return null;bn.subVectors(this.origin,e);let l=a*this.direction.dot(cs.crossVectors(bn,cs));if(l<0)return null;let c=a*this.direction.dot(Ur.cross(bn));if(c<0||l+c>o)return null;let h=-a*bn.dot(Or);return h<0?null:this.at(h/o,r)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},rt=class i{constructor(e,t,n,s,r,o,a,l,c,h,d,f,m,g,_,p){i.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,n,s,r,o,a,l,c,h,d,f,m,g,_,p)}set(e,t,n,s,r,o,a,l,c,h,d,f,m,g,_,p){let u=this.elements;return u[0]=e,u[4]=t,u[8]=n,u[12]=s,u[1]=r,u[5]=o,u[9]=a,u[13]=l,u[2]=c,u[6]=h,u[10]=d,u[14]=f,u[3]=m,u[7]=g,u[11]=_,u[15]=p,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new i().fromArray(this.elements)}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){let t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){let t=this.elements,n=e.elements,s=1/ni.setFromMatrixColumn(e,0).length(),r=1/ni.setFromMatrixColumn(e,1).length(),o=1/ni.setFromMatrixColumn(e,2).length();return t[0]=n[0]*s,t[1]=n[1]*s,t[2]=n[2]*s,t[3]=0,t[4]=n[4]*r,t[5]=n[5]*r,t[6]=n[6]*r,t[7]=0,t[8]=n[8]*o,t[9]=n[9]*o,t[10]=n[10]*o,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){let t=this.elements,n=e.x,s=e.y,r=e.z,o=Math.cos(n),a=Math.sin(n),l=Math.cos(s),c=Math.sin(s),h=Math.cos(r),d=Math.sin(r);if(e.order==="XYZ"){let f=o*h,m=o*d,g=a*h,_=a*d;t[0]=l*h,t[4]=-l*d,t[8]=c,t[1]=m+g*c,t[5]=f-_*c,t[9]=-a*l,t[2]=_-f*c,t[6]=g+m*c,t[10]=o*l}else if(e.order==="YXZ"){let f=l*h,m=l*d,g=c*h,_=c*d;t[0]=f+_*a,t[4]=g*a-m,t[8]=o*c,t[1]=o*d,t[5]=o*h,t[9]=-a,t[2]=m*a-g,t[6]=_+f*a,t[10]=o*l}else if(e.order==="ZXY"){let f=l*h,m=l*d,g=c*h,_=c*d;t[0]=f-_*a,t[4]=-o*d,t[8]=g+m*a,t[1]=m+g*a,t[5]=o*h,t[9]=_-f*a,t[2]=-o*c,t[6]=a,t[10]=o*l}else if(e.order==="ZYX"){let f=o*h,m=o*d,g=a*h,_=a*d;t[0]=l*h,t[4]=g*c-m,t[8]=f*c+_,t[1]=l*d,t[5]=_*c+f,t[9]=m*c-g,t[2]=-c,t[6]=a*l,t[10]=o*l}else if(e.order==="YZX"){let f=o*l,m=o*c,g=a*l,_=a*c;t[0]=l*h,t[4]=_-f*d,t[8]=g*d+m,t[1]=d,t[5]=o*h,t[9]=-a*h,t[2]=-c*h,t[6]=m*d+g,t[10]=f-_*d}else if(e.order==="XZY"){let f=o*l,m=o*c,g=a*l,_=a*c;t[0]=l*h,t[4]=-d,t[8]=c*h,t[1]=f*d+_,t[5]=o*h,t[9]=m*d-g,t[2]=g*d-m,t[6]=a*h,t[10]=_*d+f}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(jc,e,Jc)}lookAt(e,t,n){let s=this.elements;return Ct.subVectors(e,t),Ct.lengthSq()===0&&(Ct.z=1),Ct.normalize(),Sn.crossVectors(n,Ct),Sn.lengthSq()===0&&(Math.abs(n.z)===1?Ct.x+=1e-4:Ct.z+=1e-4,Ct.normalize(),Sn.crossVectors(n,Ct)),Sn.normalize(),hs.crossVectors(Ct,Sn),s[0]=Sn.x,s[4]=hs.x,s[8]=Ct.x,s[1]=Sn.y,s[5]=hs.y,s[9]=Ct.y,s[2]=Sn.z,s[6]=hs.z,s[10]=Ct.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,s=t.elements,r=this.elements,o=n[0],a=n[4],l=n[8],c=n[12],h=n[1],d=n[5],f=n[9],m=n[13],g=n[2],_=n[6],p=n[10],u=n[14],S=n[3],y=n[7],R=n[11],w=n[15],P=s[0],T=s[4],k=s[8],v=s[12],E=s[1],Z=s[5],te=s[9],F=s[13],H=s[2],V=s[6],K=s[10],X=s[14],q=s[3],J=s[7],$=s[11],O=s[15];return r[0]=o*P+a*E+l*H+c*q,r[4]=o*T+a*Z+l*V+c*J,r[8]=o*k+a*te+l*K+c*$,r[12]=o*v+a*F+l*X+c*O,r[1]=h*P+d*E+f*H+m*q,r[5]=h*T+d*Z+f*V+m*J,r[9]=h*k+d*te+f*K+m*$,r[13]=h*v+d*F+f*X+m*O,r[2]=g*P+_*E+p*H+u*q,r[6]=g*T+_*Z+p*V+u*J,r[10]=g*k+_*te+p*K+u*$,r[14]=g*v+_*F+p*X+u*O,r[3]=S*P+y*E+R*H+w*q,r[7]=S*T+y*Z+R*V+w*J,r[11]=S*k+y*te+R*K+w*$,r[15]=S*v+y*F+R*X+w*O,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[4],s=e[8],r=e[12],o=e[1],a=e[5],l=e[9],c=e[13],h=e[2],d=e[6],f=e[10],m=e[14],g=e[3],_=e[7],p=e[11],u=e[15];return g*(+r*l*d-s*c*d-r*a*f+n*c*f+s*a*m-n*l*m)+_*(+t*l*m-t*c*f+r*o*f-s*o*m+s*c*h-r*l*h)+p*(+t*c*d-t*a*m-r*o*d+n*o*m+r*a*h-n*c*h)+u*(-s*a*h-t*l*d+t*a*f+s*o*d-n*o*f+n*l*h)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){let s=this.elements;return e.isVector3?(s[12]=e.x,s[13]=e.y,s[14]=e.z):(s[12]=e,s[13]=t,s[14]=n),this}invert(){let e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],o=e[4],a=e[5],l=e[6],c=e[7],h=e[8],d=e[9],f=e[10],m=e[11],g=e[12],_=e[13],p=e[14],u=e[15],S=d*p*c-_*f*c+_*l*m-a*p*m-d*l*u+a*f*u,y=g*f*c-h*p*c-g*l*m+o*p*m+h*l*u-o*f*u,R=h*_*c-g*d*c+g*a*m-o*_*m-h*a*u+o*d*u,w=g*d*l-h*_*l-g*a*f+o*_*f+h*a*p-o*d*p,P=t*S+n*y+s*R+r*w;if(P===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let T=1/P;return e[0]=S*T,e[1]=(_*f*r-d*p*r-_*s*m+n*p*m+d*s*u-n*f*u)*T,e[2]=(a*p*r-_*l*r+_*s*c-n*p*c-a*s*u+n*l*u)*T,e[3]=(d*l*r-a*f*r-d*s*c+n*f*c+a*s*m-n*l*m)*T,e[4]=y*T,e[5]=(h*p*r-g*f*r+g*s*m-t*p*m-h*s*u+t*f*u)*T,e[6]=(g*l*r-o*p*r-g*s*c+t*p*c+o*s*u-t*l*u)*T,e[7]=(o*f*r-h*l*r+h*s*c-t*f*c-o*s*m+t*l*m)*T,e[8]=R*T,e[9]=(g*d*r-h*_*r-g*n*m+t*_*m+h*n*u-t*d*u)*T,e[10]=(o*_*r-g*a*r+g*n*c-t*_*c-o*n*u+t*a*u)*T,e[11]=(h*a*r-o*d*r-h*n*c+t*d*c+o*n*m-t*a*m)*T,e[12]=w*T,e[13]=(h*_*s-g*d*s+g*n*f-t*_*f-h*n*p+t*d*p)*T,e[14]=(g*a*s-o*_*s-g*n*l+t*_*l+o*n*p-t*a*p)*T,e[15]=(o*d*s-h*a*s+h*n*l-t*d*l-o*n*f+t*a*f)*T,this}scale(e){let t=this.elements,n=e.x,s=e.y,r=e.z;return t[0]*=n,t[4]*=s,t[8]*=r,t[1]*=n,t[5]*=s,t[9]*=r,t[2]*=n,t[6]*=s,t[10]*=r,t[3]*=n,t[7]*=s,t[11]*=r,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],s=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,s))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){let t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let n=Math.cos(t),s=Math.sin(t),r=1-n,o=e.x,a=e.y,l=e.z,c=r*o,h=r*a;return this.set(c*o+n,c*a-s*l,c*l+s*a,0,c*a+s*l,h*a+n,h*l-s*o,0,c*l-s*a,h*l+s*o,r*l*l+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,s,r,o){return this.set(1,n,r,0,e,1,o,0,t,s,1,0,0,0,0,1),this}compose(e,t,n){let s=this.elements,r=t._x,o=t._y,a=t._z,l=t._w,c=r+r,h=o+o,d=a+a,f=r*c,m=r*h,g=r*d,_=o*h,p=o*d,u=a*d,S=l*c,y=l*h,R=l*d,w=n.x,P=n.y,T=n.z;return s[0]=(1-(_+u))*w,s[1]=(m+R)*w,s[2]=(g-y)*w,s[3]=0,s[4]=(m-R)*P,s[5]=(1-(f+u))*P,s[6]=(p+S)*P,s[7]=0,s[8]=(g+y)*T,s[9]=(p-S)*T,s[10]=(1-(f+_))*T,s[11]=0,s[12]=e.x,s[13]=e.y,s[14]=e.z,s[15]=1,this}decompose(e,t,n){let s=this.elements,r=ni.set(s[0],s[1],s[2]).length(),o=ni.set(s[4],s[5],s[6]).length(),a=ni.set(s[8],s[9],s[10]).length();this.determinant()<0&&(r=-r),e.x=s[12],e.y=s[13],e.z=s[14],Wt.copy(this);let c=1/r,h=1/o,d=1/a;return Wt.elements[0]*=c,Wt.elements[1]*=c,Wt.elements[2]*=c,Wt.elements[4]*=h,Wt.elements[5]*=h,Wt.elements[6]*=h,Wt.elements[8]*=d,Wt.elements[9]*=d,Wt.elements[10]*=d,t.setFromRotationMatrix(Wt),n.x=r,n.y=o,n.z=a,this}makePerspective(e,t,n,s,r,o,a=gn){let l=this.elements,c=2*r/(t-e),h=2*r/(n-s),d=(t+e)/(t-e),f=(n+s)/(n-s),m,g;if(a===gn)m=-(o+r)/(o-r),g=-2*o*r/(o-r);else if(a===Is)m=-o/(o-r),g=-o*r/(o-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+a);return l[0]=c,l[4]=0,l[8]=d,l[12]=0,l[1]=0,l[5]=h,l[9]=f,l[13]=0,l[2]=0,l[6]=0,l[10]=m,l[14]=g,l[3]=0,l[7]=0,l[11]=-1,l[15]=0,this}makeOrthographic(e,t,n,s,r,o,a=gn){let l=this.elements,c=1/(t-e),h=1/(n-s),d=1/(o-r),f=(t+e)*c,m=(n+s)*h,g,_;if(a===gn)g=(o+r)*d,_=-2*d;else if(a===Is)g=r*d,_=-1*d;else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+a);return l[0]=2*c,l[4]=0,l[8]=0,l[12]=-f,l[1]=0,l[5]=2*h,l[9]=0,l[13]=-m,l[2]=0,l[6]=0,l[10]=_,l[14]=-g,l[3]=0,l[7]=0,l[11]=0,l[15]=1,this}equals(e){let t=this.elements,n=e.elements;for(let s=0;s<16;s++)if(t[s]!==n[s])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}},ni=new L,Wt=new rt,jc=new L(0,0,0),Jc=new L(1,1,1),Sn=new L,hs=new L,Ct=new L,Wo=new rt,Xo=new Jt,zs=class i{constructor(e=0,t=0,n=0,s=i.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=n,this._order=s}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,s=this._order){return this._x=e,this._y=t,this._z=n,this._order=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){let s=e.elements,r=s[0],o=s[4],a=s[8],l=s[1],c=s[5],h=s[9],d=s[2],f=s[6],m=s[10];switch(t){case"XYZ":this._y=Math.asin(xt(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(-h,m),this._z=Math.atan2(-o,r)):(this._x=Math.atan2(f,c),this._z=0);break;case"YXZ":this._x=Math.asin(-xt(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(a,m),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-d,r),this._z=0);break;case"ZXY":this._x=Math.asin(xt(f,-1,1)),Math.abs(f)<.9999999?(this._y=Math.atan2(-d,m),this._z=Math.atan2(-o,c)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-xt(d,-1,1)),Math.abs(d)<.9999999?(this._x=Math.atan2(f,m),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-o,c));break;case"YZX":this._z=Math.asin(xt(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-h,c),this._y=Math.atan2(-d,r)):(this._x=0,this._y=Math.atan2(a,m));break;case"XZY":this._z=Math.asin(-xt(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(f,c),this._y=Math.atan2(a,r)):(this._x=Math.atan2(-h,m),this._y=0);break;default:console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return Wo.makeRotationFromQuaternion(e),this.setFromRotationMatrix(Wo,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return Xo.setFromEuler(this),this.setFromQuaternion(Xo,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};zs.DEFAULT_ORDER="XYZ";var Bs=class{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}},$c=0,qo=new L,ii=new Jt,dn=new rt,us=new L,Di=new L,Kc=new L,Qc=new Jt,Yo=new L(1,0,0),Zo=new L(0,1,0),jo=new L(0,0,1),eh={type:"added"},th={type:"removed"},Et=class i extends rn{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:$c++}),this.uuid=_n(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=i.DEFAULT_UP.clone();let e=new L,t=new zs,n=new Jt,s=new L(1,1,1);function r(){n.setFromEuler(t,!1)}function o(){t.setFromQuaternion(n,void 0,!1)}t._onChange(r),n._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:s},modelViewMatrix:{value:new rt},normalMatrix:{value:new De}}),this.matrix=new rt,this.matrixWorld=new rt,this.matrixAutoUpdate=i.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.matrixWorldAutoUpdate=i.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.layers=new Bs,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.userData={}}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return ii.setFromAxisAngle(e,t),this.quaternion.multiply(ii),this}rotateOnWorldAxis(e,t){return ii.setFromAxisAngle(e,t),this.quaternion.premultiply(ii),this}rotateX(e){return this.rotateOnAxis(Yo,e)}rotateY(e){return this.rotateOnAxis(Zo,e)}rotateZ(e){return this.rotateOnAxis(jo,e)}translateOnAxis(e,t){return qo.copy(e).applyQuaternion(this.quaternion),this.position.add(qo.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(Yo,e)}translateY(e){return this.translateOnAxis(Zo,e)}translateZ(e){return this.translateOnAxis(jo,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(dn.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?us.copy(e):us.set(e,t,n);let s=this.parent;this.updateWorldMatrix(!0,!1),Di.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?dn.lookAt(Di,us,this.up):dn.lookAt(us,Di,this.up),this.quaternion.setFromRotationMatrix(dn),s&&(dn.extractRotation(s.matrixWorld),ii.setFromRotationMatrix(dn),this.quaternion.premultiply(ii.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(console.error("THREE.Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.parent!==null&&e.parent.remove(e),e.parent=this,this.children.push(e),e.dispatchEvent(eh)):console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(th)),this}removeFromParent(){let e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),dn.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),dn.multiply(e.parent.matrixWorld)),e.applyMatrix4(dn),this.add(e),e.updateWorldMatrix(!1,!0),this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,s=this.children.length;n<s;n++){let o=this.children[n].getObjectByProperty(e,t);if(o!==void 0)return o}}getObjectsByProperty(e,t){let n=[];this[e]===t&&n.push(this);for(let s=0,r=this.children.length;s<r;s++){let o=this.children[s].getObjectsByProperty(e,t);o.length>0&&(n=n.concat(o))}return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Di,e,Kc),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Di,Qc,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);let t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].traverseVisible(e)}traverseAncestors(e){let t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix),this.matrixWorldNeedsUpdate=!1,e=!0);let t=this.children;for(let n=0,s=t.length;n<s;n++){let r=t[n];(r.matrixWorldAutoUpdate===!0||e===!0)&&r.updateMatrixWorld(e)}}updateWorldMatrix(e,t){let n=this.parent;if(e===!0&&n!==null&&n.matrixWorldAutoUpdate===!0&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix),t===!0){let s=this.children;for(let r=0,o=s.length;r<o;r++){let a=s[r];a.matrixWorldAutoUpdate===!0&&a.updateWorldMatrix(!1,!0)}}}toJSON(e){let t=e===void 0||typeof e=="string",n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.6,type:"Object",generator:"Object3D.toJSON"});let s={};s.uuid=this.uuid,s.type=this.type,this.name!==""&&(s.name=this.name),this.castShadow===!0&&(s.castShadow=!0),this.receiveShadow===!0&&(s.receiveShadow=!0),this.visible===!1&&(s.visible=!1),this.frustumCulled===!1&&(s.frustumCulled=!1),this.renderOrder!==0&&(s.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(s.userData=this.userData),s.layers=this.layers.mask,s.matrix=this.matrix.toArray(),s.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(s.matrixAutoUpdate=!1),this.isInstancedMesh&&(s.type="InstancedMesh",s.count=this.count,s.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(s.instanceColor=this.instanceColor.toJSON()));function r(a,l){return a[l.uuid]===void 0&&(a[l.uuid]=l.toJSON(e)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?s.background=this.background.toJSON():this.background.isTexture&&(s.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(s.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){s.geometry=r(e.geometries,this.geometry);let a=this.geometry.parameters;if(a!==void 0&&a.shapes!==void 0){let l=a.shapes;if(Array.isArray(l))for(let c=0,h=l.length;c<h;c++){let d=l[c];r(e.shapes,d)}else r(e.shapes,l)}}if(this.isSkinnedMesh&&(s.bindMode=this.bindMode,s.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(e.skeletons,this.skeleton),s.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let a=[];for(let l=0,c=this.material.length;l<c;l++)a.push(r(e.materials,this.material[l]));s.material=a}else s.material=r(e.materials,this.material);if(this.children.length>0){s.children=[];for(let a=0;a<this.children.length;a++)s.children.push(this.children[a].toJSON(e).object)}if(this.animations.length>0){s.animations=[];for(let a=0;a<this.animations.length;a++){let l=this.animations[a];s.animations.push(r(e.animations,l))}}if(t){let a=o(e.geometries),l=o(e.materials),c=o(e.textures),h=o(e.images),d=o(e.shapes),f=o(e.skeletons),m=o(e.animations),g=o(e.nodes);a.length>0&&(n.geometries=a),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),h.length>0&&(n.images=h),d.length>0&&(n.shapes=d),f.length>0&&(n.skeletons=f),m.length>0&&(n.animations=m),g.length>0&&(n.nodes=g)}return n.object=s,n;function o(a){let l=[];for(let c in a){let h=a[c];delete h.metadata,l.push(h)}return l}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let n=0;n<e.children.length;n++){let s=e.children[n];this.add(s.clone())}return this}};Et.DEFAULT_UP=new L(0,1,0);Et.DEFAULT_MATRIX_AUTO_UPDATE=!0;Et.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var Xt=new L,fn=new L,Nr=new L,pn=new L,si=new L,ri=new L,Jo=new L,Fr=new L,zr=new L,Br=new L,ds=!1,Bn=class i{constructor(e=new L,t=new L,n=new L){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,s){s.subVectors(n,t),Xt.subVectors(e,t),s.cross(Xt);let r=s.lengthSq();return r>0?s.multiplyScalar(1/Math.sqrt(r)):s.set(0,0,0)}static getBarycoord(e,t,n,s,r){Xt.subVectors(s,t),fn.subVectors(n,t),Nr.subVectors(e,t);let o=Xt.dot(Xt),a=Xt.dot(fn),l=Xt.dot(Nr),c=fn.dot(fn),h=fn.dot(Nr),d=o*c-a*a;if(d===0)return r.set(-2,-1,-1);let f=1/d,m=(c*l-a*h)*f,g=(o*h-a*l)*f;return r.set(1-m-g,g,m)}static containsPoint(e,t,n,s){return this.getBarycoord(e,t,n,s,pn),pn.x>=0&&pn.y>=0&&pn.x+pn.y<=1}static getUV(e,t,n,s,r,o,a,l){return ds===!1&&(console.warn("THREE.Triangle.getUV() has been renamed to THREE.Triangle.getInterpolation()."),ds=!0),this.getInterpolation(e,t,n,s,r,o,a,l)}static getInterpolation(e,t,n,s,r,o,a,l){return this.getBarycoord(e,t,n,s,pn),l.setScalar(0),l.addScaledVector(r,pn.x),l.addScaledVector(o,pn.y),l.addScaledVector(a,pn.z),l}static isFrontFacing(e,t,n,s){return Xt.subVectors(n,t),fn.subVectors(e,t),Xt.cross(fn).dot(s)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,s){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[s]),this}setFromAttributeAndIndices(e,t,n,s){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,s),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return Xt.subVectors(this.c,this.b),fn.subVectors(this.a,this.b),Xt.cross(fn).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return i.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return i.getBarycoord(e,this.a,this.b,this.c,t)}getUV(e,t,n,s,r){return ds===!1&&(console.warn("THREE.Triangle.getUV() has been renamed to THREE.Triangle.getInterpolation()."),ds=!0),i.getInterpolation(e,this.a,this.b,this.c,t,n,s,r)}getInterpolation(e,t,n,s,r){return i.getInterpolation(e,this.a,this.b,this.c,t,n,s,r)}containsPoint(e){return i.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return i.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){let n=this.a,s=this.b,r=this.c,o,a;si.subVectors(s,n),ri.subVectors(r,n),Fr.subVectors(e,n);let l=si.dot(Fr),c=ri.dot(Fr);if(l<=0&&c<=0)return t.copy(n);zr.subVectors(e,s);let h=si.dot(zr),d=ri.dot(zr);if(h>=0&&d<=h)return t.copy(s);let f=l*d-h*c;if(f<=0&&l>=0&&h<=0)return o=l/(l-h),t.copy(n).addScaledVector(si,o);Br.subVectors(e,r);let m=si.dot(Br),g=ri.dot(Br);if(g>=0&&m<=g)return t.copy(r);let _=m*c-l*g;if(_<=0&&c>=0&&g<=0)return a=c/(c-g),t.copy(n).addScaledVector(ri,a);let p=h*g-m*d;if(p<=0&&d-h>=0&&m-g>=0)return Jo.subVectors(r,s),a=(d-h)/(d-h+(m-g)),t.copy(s).addScaledVector(Jo,a);let u=1/(p+_+f);return o=_*u,a=f*u,t.copy(n).addScaledVector(si,o).addScaledVector(ri,a)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}},nh=0,Rn=class extends rn{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:nh++}),this.uuid=_n(),this.name="",this.type="Material",this.blending=yi,this.side=Dt,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=P0,this.blendDst=L0,this.blendEquation=_i,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.depthFunc=Jr,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=gc,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=Tr,this.stencilZFail=Tr,this.stencilZPass=Tr,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBuild(){}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(let t in e){let n=e[t];if(n===void 0){console.warn(`THREE.Material: parameter '${t}' has value of undefined.`);continue}let s=this[t];if(s===void 0){console.warn(`THREE.Material: '${t}' is not a property of THREE.${this.type}.`);continue}s&&s.isColor?s.set(n):s&&s.isVector3&&n&&n.isVector3?s.copy(n):this[t]=n}}toJSON(e){let t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});let n={metadata:{version:4.6,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==yi&&(n.blending=this.blending),this.side!==Dt&&(n.side=this.side),this.vertexColors&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=this.transparent),n.depthFunc=this.depthFunc,n.depthTest=this.depthTest,n.depthWrite=this.depthWrite,n.colorWrite=this.colorWrite,n.stencilWrite=this.stencilWrite,n.stencilWriteMask=this.stencilWriteMask,n.stencilFunc=this.stencilFunc,n.stencilRef=this.stencilRef,n.stencilFuncMask=this.stencilFuncMask,n.stencilFail=this.stencilFail,n.stencilZFail=this.stencilZFail,n.stencilZPass=this.stencilZPass,this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=this.alphaHash),this.alphaToCoverage===!0&&(n.alphaToCoverage=this.alphaToCoverage),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=this.premultipliedAlpha),this.forceSinglePass===!0&&(n.forceSinglePass=this.forceSinglePass),this.wireframe===!0&&(n.wireframe=this.wireframe),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=this.flatShading),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function s(r){let o=[];for(let a in r){let l=r[a];delete l.metadata,o.push(l)}return o}if(t){let r=s(e.textures),o=s(e.images);r.length>0&&(n.textures=r),o.length>0&&(n.images=o)}return n}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;let t=e.clippingPlanes,n=null;if(t!==null){let s=t.length;n=new Array(s);for(let r=0;r!==s;++r)n[r]=t[r].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}},W0={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},qt={h:0,s:0,l:0},fs={h:0,s:0,l:0};function kr(i,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?i+(e-i)*6*t:t<1/2?e:t<2/3?i+(e-i)*6*(2/3-t):i}var ze=class{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){let s=e;s&&s.isColor?this.copy(s):typeof s=="number"?this.setHex(s):typeof s=="string"&&this.setStyle(s)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=Xe){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,Lt.toWorkingColorSpace(this,t),this}setRGB(e,t,n,s=Lt.workingColorSpace){return this.r=e,this.g=t,this.b=n,Lt.toWorkingColorSpace(this,s),this}setHSL(e,t,n,s=Lt.workingColorSpace){if(e=Da(e,1),t=xt(t,0,1),n=xt(n,0,1),t===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+t):n+t-n*t,o=2*n-r;this.r=kr(o,r,e+1/3),this.g=kr(o,r,e),this.b=kr(o,r,e-1/3)}return Lt.toWorkingColorSpace(this,s),this}setStyle(e,t=Xe){function n(r){r!==void 0&&parseFloat(r)<1&&console.warn("THREE.Color: Alpha component of "+e+" will be ignored.")}let s;if(s=/^(\w+)\(([^\)]*)\)/.exec(e)){let r,o=s[1],a=s[2];switch(o){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,t);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,t);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,t);break;default:console.warn("THREE.Color: Unknown color model "+e)}}else if(s=/^\#([A-Fa-f\d]+)$/.exec(e)){let r=s[1],o=r.length;if(o===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,t);if(o===6)return this.setHex(parseInt(r,16),t);console.warn("THREE.Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=Xe){let n=W0[e.toLowerCase()];return n!==void 0?this.setHex(n,t):console.warn("THREE.Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=vi(e.r),this.g=vi(e.g),this.b=vi(e.b),this}copyLinearToSRGB(e){return this.r=Rr(e.r),this.g=Rr(e.g),this.b=Rr(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=Xe){return Lt.fromWorkingColorSpace(_t.copy(this),e),Math.round(xt(_t.r*255,0,255))*65536+Math.round(xt(_t.g*255,0,255))*256+Math.round(xt(_t.b*255,0,255))}getHexString(e=Xe){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=Lt.workingColorSpace){Lt.fromWorkingColorSpace(_t.copy(this),t);let n=_t.r,s=_t.g,r=_t.b,o=Math.max(n,s,r),a=Math.min(n,s,r),l,c,h=(a+o)/2;if(a===o)l=0,c=0;else{let d=o-a;switch(c=h<=.5?d/(o+a):d/(2-o-a),o){case n:l=(s-r)/d+(s<r?6:0);break;case s:l=(r-n)/d+2;break;case r:l=(n-s)/d+4;break}l/=6}return e.h=l,e.s=c,e.l=h,e}getRGB(e,t=Lt.workingColorSpace){return Lt.fromWorkingColorSpace(_t.copy(this),t),e.r=_t.r,e.g=_t.g,e.b=_t.b,e}getStyle(e=Xe){Lt.fromWorkingColorSpace(_t.copy(this),e);let t=_t.r,n=_t.g,s=_t.b;return e!==Xe?`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${s.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(s*255)})`}offsetHSL(e,t,n){return this.getHSL(qt),qt.h+=e,qt.s+=t,qt.l+=n,this.setHSL(qt.h,qt.s,qt.l),this}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(qt),e.getHSL(fs);let n=Vi(qt.h,fs.h,t),s=Vi(qt.s,fs.s,t),r=Vi(qt.l,fs.l,t);return this.setHSL(n,s,r),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,n=this.g,s=this.b,r=e.elements;return this.r=r[0]*t+r[3]*n+r[6]*s,this.g=r[1]*t+r[4]*n+r[7]*s,this.b=r[2]*t+r[5]*n+r[8]*s,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},_t=new ze;ze.NAMES=W0;var ks=class extends Rn{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new ze(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.combine=I0,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}};var st=new L,ps=new me,It=class{constructor(e,t,n=!1){if(Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=n,this.usage=ea,this.updateRange={offset:0,count:-1},this.gpuType=tn,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let s=0,r=this.itemSize;s<r;s++)this.array[e+s]=t.array[n+s];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)ps.fromBufferAttribute(this,t),ps.applyMatrix3(e),this.setXY(t,ps.x,ps.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)st.fromBufferAttribute(this,t),st.applyMatrix3(e),this.setXYZ(t,st.x,st.y,st.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)st.fromBufferAttribute(this,t),st.applyMatrix4(e),this.setXYZ(t,st.x,st.y,st.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)st.fromBufferAttribute(this,t),st.applyNormalMatrix(e),this.setXYZ(t,st.x,st.y,st.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)st.fromBufferAttribute(this,t),st.transformDirection(e),this.setXYZ(t,st.x,st.y,st.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=en(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=qe(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=en(t,this.array)),t}setX(e,t){return this.normalized&&(t=qe(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=en(t,this.array)),t}setY(e,t){return this.normalized&&(t=qe(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=en(t,this.array)),t}setZ(e,t){return this.normalized&&(t=qe(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=en(t,this.array)),t}setW(e,t){return this.normalized&&(t=qe(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=qe(t,this.array),n=qe(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,s){return e*=this.itemSize,this.normalized&&(t=qe(t,this.array),n=qe(n,this.array),s=qe(s,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=s,this}setXYZW(e,t,n,s,r){return e*=this.itemSize,this.normalized&&(t=qe(t,this.array),n=qe(n,this.array),s=qe(s,this.array),r=qe(r,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=s,this.array[e+3]=r,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(e.name=this.name),this.usage!==ea&&(e.usage=this.usage),(this.updateRange.offset!==0||this.updateRange.count!==-1)&&(e.updateRange=this.updateRange),e}};var Vs=class extends It{constructor(e,t,n){super(new Uint16Array(e),t,n)}};var Hs=class extends It{constructor(e,t,n){super(new Uint32Array(e),t,n)}};var mt=class extends It{constructor(e,t,n){super(new Float32Array(e),t,n)}};var ih=0,Ft=new rt,Vr=new Et,ai=new L,Pt=new Xn,Ui=new Xn,dt=new L,Ot=class i extends rn{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:ih++}),this.uuid=_n(),this.name="",this.type="BufferGeometry",this.index=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(G0(e)?Hs:Vs)(e,1):this.index=e,this}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let r=new De().getNormalMatrix(e);n.applyNormalMatrix(r),n.needsUpdate=!0}let s=this.attributes.tangent;return s!==void 0&&(s.transformDirection(e),s.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(e){return Ft.makeRotationFromQuaternion(e),this.applyMatrix4(Ft),this}rotateX(e){return Ft.makeRotationX(e),this.applyMatrix4(Ft),this}rotateY(e){return Ft.makeRotationY(e),this.applyMatrix4(Ft),this}rotateZ(e){return Ft.makeRotationZ(e),this.applyMatrix4(Ft),this}translate(e,t,n){return Ft.makeTranslation(e,t,n),this.applyMatrix4(Ft),this}scale(e,t,n){return Ft.makeScale(e,t,n),this.applyMatrix4(Ft),this}lookAt(e){return Vr.lookAt(e),Vr.updateMatrix(),this.applyMatrix4(Vr.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(ai).negate(),this.translate(ai.x,ai.y,ai.z),this}setFromPoints(e){let t=[];for(let n=0,s=e.length;n<s;n++){let r=e[n];t.push(r.x,r.y,r.z||0)}return this.setAttribute("position",new mt(t,3)),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Xn);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){console.error('THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box. Alternatively set "mesh.frustumCulled" to "false".',this),this.boundingBox.set(new L(-1/0,-1/0,-1/0),new L(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let n=0,s=t.length;n<s;n++){let r=t[n];Pt.setFromBufferAttribute(r),this.morphTargetsRelative?(dt.addVectors(this.boundingBox.min,Pt.min),this.boundingBox.expandByPoint(dt),dt.addVectors(this.boundingBox.max,Pt.max),this.boundingBox.expandByPoint(dt)):(this.boundingBox.expandByPoint(Pt.min),this.boundingBox.expandByPoint(Pt.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Yi);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){console.error('THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere. Alternatively set "mesh.frustumCulled" to "false".',this),this.boundingSphere.set(new L,1/0);return}if(e){let n=this.boundingSphere.center;if(Pt.setFromBufferAttribute(e),t)for(let r=0,o=t.length;r<o;r++){let a=t[r];Ui.setFromBufferAttribute(a),this.morphTargetsRelative?(dt.addVectors(Pt.min,Ui.min),Pt.expandByPoint(dt),dt.addVectors(Pt.max,Ui.max),Pt.expandByPoint(dt)):(Pt.expandByPoint(Ui.min),Pt.expandByPoint(Ui.max))}Pt.getCenter(n);let s=0;for(let r=0,o=e.count;r<o;r++)dt.fromBufferAttribute(e,r),s=Math.max(s,n.distanceToSquared(dt));if(t)for(let r=0,o=t.length;r<o;r++){let a=t[r],l=this.morphTargetsRelative;for(let c=0,h=a.count;c<h;c++)dt.fromBufferAttribute(a,c),l&&(ai.fromBufferAttribute(e,c),dt.add(ai)),s=Math.max(s,n.distanceToSquared(dt))}this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){console.error("THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let n=e.array,s=t.position.array,r=t.normal.array,o=t.uv.array,a=s.length/3;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new It(new Float32Array(4*a),4));let l=this.getAttribute("tangent").array,c=[],h=[];for(let E=0;E<a;E++)c[E]=new L,h[E]=new L;let d=new L,f=new L,m=new L,g=new me,_=new me,p=new me,u=new L,S=new L;function y(E,Z,te){d.fromArray(s,E*3),f.fromArray(s,Z*3),m.fromArray(s,te*3),g.fromArray(o,E*2),_.fromArray(o,Z*2),p.fromArray(o,te*2),f.sub(d),m.sub(d),_.sub(g),p.sub(g);let F=1/(_.x*p.y-p.x*_.y);isFinite(F)&&(u.copy(f).multiplyScalar(p.y).addScaledVector(m,-_.y).multiplyScalar(F),S.copy(m).multiplyScalar(_.x).addScaledVector(f,-p.x).multiplyScalar(F),c[E].add(u),c[Z].add(u),c[te].add(u),h[E].add(S),h[Z].add(S),h[te].add(S))}let R=this.groups;R.length===0&&(R=[{start:0,count:n.length}]);for(let E=0,Z=R.length;E<Z;++E){let te=R[E],F=te.start,H=te.count;for(let V=F,K=F+H;V<K;V+=3)y(n[V+0],n[V+1],n[V+2])}let w=new L,P=new L,T=new L,k=new L;function v(E){T.fromArray(r,E*3),k.copy(T);let Z=c[E];w.copy(Z),w.sub(T.multiplyScalar(T.dot(Z))).normalize(),P.crossVectors(k,Z);let F=P.dot(h[E])<0?-1:1;l[E*4]=w.x,l[E*4+1]=w.y,l[E*4+2]=w.z,l[E*4+3]=F}for(let E=0,Z=R.length;E<Z;++E){let te=R[E],F=te.start,H=te.count;for(let V=F,K=F+H;V<K;V+=3)v(n[V+0]),v(n[V+1]),v(n[V+2])}}computeVertexNormals(){let e=this.index,t=this.getAttribute("position");if(t!==void 0){let n=this.getAttribute("normal");if(n===void 0)n=new It(new Float32Array(t.count*3),3),this.setAttribute("normal",n);else for(let f=0,m=n.count;f<m;f++)n.setXYZ(f,0,0,0);let s=new L,r=new L,o=new L,a=new L,l=new L,c=new L,h=new L,d=new L;if(e)for(let f=0,m=e.count;f<m;f+=3){let g=e.getX(f+0),_=e.getX(f+1),p=e.getX(f+2);s.fromBufferAttribute(t,g),r.fromBufferAttribute(t,_),o.fromBufferAttribute(t,p),h.subVectors(o,r),d.subVectors(s,r),h.cross(d),a.fromBufferAttribute(n,g),l.fromBufferAttribute(n,_),c.fromBufferAttribute(n,p),a.add(h),l.add(h),c.add(h),n.setXYZ(g,a.x,a.y,a.z),n.setXYZ(_,l.x,l.y,l.z),n.setXYZ(p,c.x,c.y,c.z)}else for(let f=0,m=t.count;f<m;f+=3)s.fromBufferAttribute(t,f+0),r.fromBufferAttribute(t,f+1),o.fromBufferAttribute(t,f+2),h.subVectors(o,r),d.subVectors(s,r),h.cross(d),n.setXYZ(f+0,h.x,h.y,h.z),n.setXYZ(f+1,h.x,h.y,h.z),n.setXYZ(f+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)dt.fromBufferAttribute(e,t),dt.normalize(),e.setXYZ(t,dt.x,dt.y,dt.z)}toNonIndexed(){function e(a,l){let c=a.array,h=a.itemSize,d=a.normalized,f=new c.constructor(l.length*h),m=0,g=0;for(let _=0,p=l.length;_<p;_++){a.isInterleavedBufferAttribute?m=l[_]*a.data.stride+a.offset:m=l[_]*h;for(let u=0;u<h;u++)f[g++]=c[m++]}return new It(f,h,d)}if(this.index===null)return console.warn("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let t=new i,n=this.index.array,s=this.attributes;for(let a in s){let l=s[a],c=e(l,n);t.setAttribute(a,c)}let r=this.morphAttributes;for(let a in r){let l=[],c=r[a];for(let h=0,d=c.length;h<d;h++){let f=c[h],m=e(f,n);l.push(m)}t.morphAttributes[a]=l}t.morphTargetsRelative=this.morphTargetsRelative;let o=this.groups;for(let a=0,l=o.length;a<l;a++){let c=o[a];t.addGroup(c.start,c.count,c.materialIndex)}return t}toJSON(){let e={metadata:{version:4.6,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.type,this.name!==""&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0){let l=this.parameters;for(let c in l)l[c]!==void 0&&(e[c]=l[c]);return e}e.data={attributes:{}};let t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});let n=this.attributes;for(let l in n){let c=n[l];e.data.attributes[l]=c.toJSON(e.data)}let s={},r=!1;for(let l in this.morphAttributes){let c=this.morphAttributes[l],h=[];for(let d=0,f=c.length;d<f;d++){let m=c[d];h.push(m.toJSON(e.data))}h.length>0&&(s[l]=h,r=!0)}r&&(e.data.morphAttributes=s,e.data.morphTargetsRelative=this.morphTargetsRelative);let o=this.groups;o.length>0&&(e.data.groups=JSON.parse(JSON.stringify(o)));let a=this.boundingSphere;return a!==null&&(e.data.boundingSphere={center:a.center.toArray(),radius:a.radius}),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let n=e.index;n!==null&&this.setIndex(n.clone(t));let s=e.attributes;for(let c in s){let h=s[c];this.setAttribute(c,h.clone(t))}let r=e.morphAttributes;for(let c in r){let h=[],d=r[c];for(let f=0,m=d.length;f<m;f++)h.push(d[f].clone(t));this.morphAttributes[c]=h}this.morphTargetsRelative=e.morphTargetsRelative;let o=e.groups;for(let c=0,h=o.length;c<h;c++){let d=o[c];this.addGroup(d.start,d.count,d.materialIndex)}let a=e.boundingBox;a!==null&&(this.boundingBox=a.clone());let l=e.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}},$o=new rt,On=new Zi,ms=new Yi,Ko=new L,oi=new L,li=new L,ci=new L,Hr=new L,gs=new L,_s=new me,xs=new me,ys=new me,Qo=new L,e0=new L,t0=new L,vs=new L,Ms=new L,Ge=class extends Et{constructor(e=new Ot,t=new ks){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){let t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){let s=t[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=s.length;r<o;r++){let a=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}getVertexPosition(e,t){let n=this.geometry,s=n.attributes.position,r=n.morphAttributes.position,o=n.morphTargetsRelative;t.fromBufferAttribute(s,e);let a=this.morphTargetInfluences;if(r&&a){gs.set(0,0,0);for(let l=0,c=r.length;l<c;l++){let h=a[l],d=r[l];h!==0&&(Hr.fromBufferAttribute(d,e),o?gs.addScaledVector(Hr,h):gs.addScaledVector(Hr.sub(t),h))}t.add(gs)}return t}raycast(e,t){let n=this.geometry,s=this.material,r=this.matrixWorld;s!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),ms.copy(n.boundingSphere),ms.applyMatrix4(r),On.copy(e.ray).recast(e.near),!(ms.containsPoint(On.origin)===!1&&(On.intersectSphere(ms,Ko)===null||On.origin.distanceToSquared(Ko)>(e.far-e.near)**2))&&($o.copy(r).invert(),On.copy(e.ray).applyMatrix4($o),!(n.boundingBox!==null&&On.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(e,t,On)))}_computeIntersections(e,t,n){let s,r=this.geometry,o=this.material,a=r.index,l=r.attributes.position,c=r.attributes.uv,h=r.attributes.uv1,d=r.attributes.normal,f=r.groups,m=r.drawRange;if(a!==null)if(Array.isArray(o))for(let g=0,_=f.length;g<_;g++){let p=f[g],u=o[p.materialIndex],S=Math.max(p.start,m.start),y=Math.min(a.count,Math.min(p.start+p.count,m.start+m.count));for(let R=S,w=y;R<w;R+=3){let P=a.getX(R),T=a.getX(R+1),k=a.getX(R+2);s=bs(this,u,e,n,c,h,d,P,T,k),s&&(s.faceIndex=Math.floor(R/3),s.face.materialIndex=p.materialIndex,t.push(s))}}else{let g=Math.max(0,m.start),_=Math.min(a.count,m.start+m.count);for(let p=g,u=_;p<u;p+=3){let S=a.getX(p),y=a.getX(p+1),R=a.getX(p+2);s=bs(this,o,e,n,c,h,d,S,y,R),s&&(s.faceIndex=Math.floor(p/3),t.push(s))}}else if(l!==void 0)if(Array.isArray(o))for(let g=0,_=f.length;g<_;g++){let p=f[g],u=o[p.materialIndex],S=Math.max(p.start,m.start),y=Math.min(l.count,Math.min(p.start+p.count,m.start+m.count));for(let R=S,w=y;R<w;R+=3){let P=R,T=R+1,k=R+2;s=bs(this,u,e,n,c,h,d,P,T,k),s&&(s.faceIndex=Math.floor(R/3),s.face.materialIndex=p.materialIndex,t.push(s))}}else{let g=Math.max(0,m.start),_=Math.min(l.count,m.start+m.count);for(let p=g,u=_;p<u;p+=3){let S=p,y=p+1,R=p+2;s=bs(this,o,e,n,c,h,d,S,y,R),s&&(s.faceIndex=Math.floor(p/3),t.push(s))}}}};function sh(i,e,t,n,s,r,o,a){let l;if(e.side===Tt?l=n.intersectTriangle(o,r,s,!0,a):l=n.intersectTriangle(s,r,o,e.side===Dt,a),l===null)return null;Ms.copy(a),Ms.applyMatrix4(i.matrixWorld);let c=t.ray.origin.distanceTo(Ms);return c<t.near||c>t.far?null:{distance:c,point:Ms.clone(),object:i}}function bs(i,e,t,n,s,r,o,a,l,c){i.getVertexPosition(a,oi),i.getVertexPosition(l,li),i.getVertexPosition(c,ci);let h=sh(i,e,t,n,oi,li,ci,vs);if(h){s&&(_s.fromBufferAttribute(s,a),xs.fromBufferAttribute(s,l),ys.fromBufferAttribute(s,c),h.uv=Bn.getInterpolation(vs,oi,li,ci,_s,xs,ys,new me)),r&&(_s.fromBufferAttribute(r,a),xs.fromBufferAttribute(r,l),ys.fromBufferAttribute(r,c),h.uv1=Bn.getInterpolation(vs,oi,li,ci,_s,xs,ys,new me),h.uv2=h.uv1),o&&(Qo.fromBufferAttribute(o,a),e0.fromBufferAttribute(o,l),t0.fromBufferAttribute(o,c),h.normal=Bn.getInterpolation(vs,oi,li,ci,Qo,e0,t0,new L),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));let d={a,b:l,c,normal:new L,materialIndex:0};Bn.getNormal(oi,li,ci,d.normal),h.face=d}return h}var et=class i extends Ot{constructor(e=1,t=1,n=1,s=1,r=1,o=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:n,widthSegments:s,heightSegments:r,depthSegments:o};let a=this;s=Math.floor(s),r=Math.floor(r),o=Math.floor(o);let l=[],c=[],h=[],d=[],f=0,m=0;g("z","y","x",-1,-1,n,t,e,o,r,0),g("z","y","x",1,-1,n,t,-e,o,r,1),g("x","z","y",1,1,e,n,t,s,o,2),g("x","z","y",1,-1,e,n,-t,s,o,3),g("x","y","z",1,-1,e,t,n,s,r,4),g("x","y","z",-1,-1,e,t,-n,s,r,5),this.setIndex(l),this.setAttribute("position",new mt(c,3)),this.setAttribute("normal",new mt(h,3)),this.setAttribute("uv",new mt(d,2));function g(_,p,u,S,y,R,w,P,T,k,v){let E=R/T,Z=w/k,te=R/2,F=w/2,H=P/2,V=T+1,K=k+1,X=0,q=0,J=new L;for(let $=0;$<K;$++){let O=$*Z-F;for(let Y=0;Y<V;Y++){let ue=Y*E-te;J[_]=ue*S,J[p]=O*y,J[u]=H,c.push(J.x,J.y,J.z),J[_]=0,J[p]=0,J[u]=P>0?1:-1,h.push(J.x,J.y,J.z),d.push(Y/T),d.push(1-$/k),X+=1}}for(let $=0;$<k;$++)for(let O=0;O<T;O++){let Y=f+O+V*$,ue=f+O+V*($+1),de=f+(O+1)+V*($+1),fe=f+(O+1)+V*$;l.push(Y,ue,fe),l.push(ue,de,fe),q+=6}a.addGroup(m,q,v),m+=q,f+=X}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new i(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}};function Ei(i){let e={};for(let t in i){e[t]={};for(let n in i[t]){let s=i[t][n];s&&(s.isColor||s.isMatrix3||s.isMatrix4||s.isVector2||s.isVector3||s.isVector4||s.isTexture||s.isQuaternion)?s.isRenderTargetTexture?(console.warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][n]=null):e[t][n]=s.clone():Array.isArray(s)?e[t][n]=s.slice():e[t][n]=s}}return e}function wt(i){let e={};for(let t=0;t<i.length;t++){let n=Ei(i[t]);for(let s in n)e[s]=n[s]}return e}function rh(i){let e=[];for(let t=0;t<i.length;t++)e.push(i[t].clone());return e}function X0(i){return i.getRenderTarget()===null?i.outputColorSpace:sn}var Ua={clone:Ei,merge:wt},ah=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,oh=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,Bt=class extends Rn{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=ah,this.fragmentShader=oh,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={derivatives:!1,fragDepth:!1,drawBuffers:!1,shaderTextureLOD:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=Ei(e.uniforms),this.uniformsGroups=rh(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let s in this.uniforms){let o=this.uniforms[s].value;o&&o.isTexture?t.uniforms[s]={type:"t",value:o.toJSON(e).uuid}:o&&o.isColor?t.uniforms[s]={type:"c",value:o.getHex()}:o&&o.isVector2?t.uniforms[s]={type:"v2",value:o.toArray()}:o&&o.isVector3?t.uniforms[s]={type:"v3",value:o.toArray()}:o&&o.isVector4?t.uniforms[s]={type:"v4",value:o.toArray()}:o&&o.isMatrix3?t.uniforms[s]={type:"m3",value:o.toArray()}:o&&o.isMatrix4?t.uniforms[s]={type:"m4",value:o.toArray()}:t.uniforms[s]={value:o}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;let n={};for(let s in this.extensions)this.extensions[s]===!0&&(n[s]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}},Gs=class extends Et{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new rt,this.projectionMatrix=new rt,this.projectionMatrixInverse=new rt,this.coordinateSystem=gn}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(-t[8],-t[9],-t[10]).normalize()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(e,t){super.updateWorldMatrix(e,t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}},yt=class extends Gs{constructor(e=50,t=1,n=.1,s=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=n,this.far=s,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=.5*this.getFilmHeight()/e;this.fov=qi*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(ki*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return qi*2*Math.atan(Math.tan(ki*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}setViewOffset(e,t,n,s,r,o){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(ki*.5*this.fov)/this.zoom,n=2*t,s=this.aspect*n,r=-.5*s,o=this.view;if(this.view!==null&&this.view.enabled){let l=o.fullWidth,c=o.fullHeight;r+=o.offsetX*s/l,t-=o.offsetY*n/c,s*=o.width/l,n*=o.height/c}let a=this.filmOffset;a!==0&&(r+=e*a/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+s,t,t-n,e,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}},hi=-90,ui=1,ra=class extends Et{constructor(e,t,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null;let s=new yt(hi,ui,e,t);s.layers=this.layers,this.add(s);let r=new yt(hi,ui,e,t);r.layers=this.layers,this.add(r);let o=new yt(hi,ui,e,t);o.layers=this.layers,this.add(o);let a=new yt(hi,ui,e,t);a.layers=this.layers,this.add(a);let l=new yt(hi,ui,e,t);l.layers=this.layers,this.add(l);let c=new yt(hi,ui,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let e=this.coordinateSystem,t=this.children.concat(),[n,s,r,o,a,l]=t;for(let c of t)this.remove(c);if(e===gn)n.up.set(0,1,0),n.lookAt(1,0,0),s.up.set(0,1,0),s.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),o.up.set(0,0,1),o.lookAt(0,-1,0),a.up.set(0,1,0),a.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(e===Is)n.up.set(0,-1,0),n.lookAt(-1,0,0),s.up.set(0,-1,0),s.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),o.up.set(0,0,-1),o.lookAt(0,-1,0),a.up.set(0,-1,0),a.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(let c of t)this.add(c),c.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();let n=this.renderTarget;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());let[s,r,o,a,l,c]=this.children,h=e.getRenderTarget(),d=e.xr.enabled;e.xr.enabled=!1;let f=n.texture.generateMipmaps;n.texture.generateMipmaps=!1,e.setRenderTarget(n,0),e.render(t,s),e.setRenderTarget(n,1),e.render(t,r),e.setRenderTarget(n,2),e.render(t,o),e.setRenderTarget(n,3),e.render(t,a),e.setRenderTarget(n,4),e.render(t,l),n.texture.generateMipmaps=f,e.setRenderTarget(n,5),e.render(t,c),e.setRenderTarget(h),e.xr.enabled=d,n.texture.needsPMREMUpdate=!0}},Ws=class extends ft{constructor(e,t,n,s,r,o,a,l,c,h){e=e!==void 0?e:[],t=t!==void 0?t:bi,super(e,t,n,s,r,o,a,l,c,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}},aa=class extends Ut{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;let n={width:e,height:e,depth:1},s=[n,n,n,n,n,n];t.encoding!==void 0&&(Hi("THREE.WebGLCubeRenderTarget: option.encoding has been replaced by option.colorSpace."),t.colorSpace=t.encoding===Hn?Xe:Gn),this.texture=new Ws(s,t.mapping,t.wrapS,t.wrapT,t.magFilter,t.minFilter,t.format,t.type,t.anisotropy,t.colorSpace),this.texture.isRenderTargetTexture=!0,this.texture.generateMipmaps=t.generateMipmaps!==void 0?t.generateMipmaps:!1,this.texture.minFilter=t.minFilter!==void 0?t.minFilter:zt}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},s=new et(5,5,5),r=new Bt({name:"CubemapFromEquirect",uniforms:Ei(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:Tt,blending:nn});r.uniforms.tEquirect.value=t;let o=new Ge(s,r),a=t.minFilter;return t.minFilter===Xi&&(t.minFilter=zt),new ra(1,10,this).update(e,o),t.minFilter=a,o.geometry.dispose(),o.material.dispose(),this}clear(e,t,n,s){let r=e.getRenderTarget();for(let o=0;o<6;o++)e.setRenderTarget(this,o),e.clear(t,n,s);e.setRenderTarget(r)}},Gr=new L,lh=new L,ch=new De,Yt=class{constructor(e=new L(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,s){return this.normal.set(e,t,n),this.constant=s,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){let s=Gr.subVectors(n,t).cross(lh.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(s,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t){let n=e.delta(Gr),s=this.normal.dot(n);if(s===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;let r=-(e.start.dot(this.normal)+this.constant)/s;return r<0||r>1?null:t.copy(e.start).addScaledVector(n,r)}intersectsLine(e){let t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let n=t||ch.getNormalMatrix(e),s=this.coplanarPoint(Gr).applyMatrix4(e),r=this.normal.applyMatrix3(n).normalize();return this.constant=-s.dot(r),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}},Nn=new Yi,Ss=new L,ji=class{constructor(e=new Yt,t=new Yt,n=new Yt,s=new Yt,r=new Yt,o=new Yt){this.planes=[e,t,n,s,r,o]}set(e,t,n,s,r,o){let a=this.planes;return a[0].copy(e),a[1].copy(t),a[2].copy(n),a[3].copy(s),a[4].copy(r),a[5].copy(o),this}copy(e){let t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=gn){let n=this.planes,s=e.elements,r=s[0],o=s[1],a=s[2],l=s[3],c=s[4],h=s[5],d=s[6],f=s[7],m=s[8],g=s[9],_=s[10],p=s[11],u=s[12],S=s[13],y=s[14],R=s[15];if(n[0].setComponents(l-r,f-c,p-m,R-u).normalize(),n[1].setComponents(l+r,f+c,p+m,R+u).normalize(),n[2].setComponents(l+o,f+h,p+g,R+S).normalize(),n[3].setComponents(l-o,f-h,p-g,R-S).normalize(),n[4].setComponents(l-a,f-d,p-_,R-y).normalize(),t===gn)n[5].setComponents(l+a,f+d,p+_,R+y).normalize();else if(t===Is)n[5].setComponents(a,d,_,y).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),Nn.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{let t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),Nn.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(Nn)}intersectsSprite(e){return Nn.center.set(0,0,0),Nn.radius=.7071067811865476,Nn.applyMatrix4(e.matrixWorld),this.intersectsSphere(Nn)}intersectsSphere(e){let t=this.planes,n=e.center,s=-e.radius;for(let r=0;r<6;r++)if(t[r].distanceToPoint(n)<s)return!1;return!0}intersectsBox(e){let t=this.planes;for(let n=0;n<6;n++){let s=t[n];if(Ss.x=s.normal.x>0?e.max.x:e.min.x,Ss.y=s.normal.y>0?e.max.y:e.min.y,Ss.z=s.normal.z>0?e.max.z:e.min.z,s.distanceToPoint(Ss)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}};function q0(){let i=null,e=!1,t=null,n=null;function s(r,o){t(r,o),n=i.requestAnimationFrame(s)}return{start:function(){e!==!0&&t!==null&&(n=i.requestAnimationFrame(s),e=!0)},stop:function(){i.cancelAnimationFrame(n),e=!1},setAnimationLoop:function(r){t=r},setContext:function(r){i=r}}}function hh(i,e){let t=e.isWebGL2,n=new WeakMap;function s(c,h){let d=c.array,f=c.usage,m=i.createBuffer();i.bindBuffer(h,m),i.bufferData(h,d,f),c.onUploadCallback();let g;if(d instanceof Float32Array)g=i.FLOAT;else if(d instanceof Uint16Array)if(c.isFloat16BufferAttribute)if(t)g=i.HALF_FLOAT;else throw new Error("THREE.WebGLAttributes: Usage of Float16BufferAttribute requires WebGL2.");else g=i.UNSIGNED_SHORT;else if(d instanceof Int16Array)g=i.SHORT;else if(d instanceof Uint32Array)g=i.UNSIGNED_INT;else if(d instanceof Int32Array)g=i.INT;else if(d instanceof Int8Array)g=i.BYTE;else if(d instanceof Uint8Array)g=i.UNSIGNED_BYTE;else if(d instanceof Uint8ClampedArray)g=i.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+d);return{buffer:m,type:g,bytesPerElement:d.BYTES_PER_ELEMENT,version:c.version}}function r(c,h,d){let f=h.array,m=h.updateRange;i.bindBuffer(d,c),m.count===-1?i.bufferSubData(d,0,f):(t?i.bufferSubData(d,m.offset*f.BYTES_PER_ELEMENT,f,m.offset,m.count):i.bufferSubData(d,m.offset*f.BYTES_PER_ELEMENT,f.subarray(m.offset,m.offset+m.count)),m.count=-1),h.onUploadCallback()}function o(c){return c.isInterleavedBufferAttribute&&(c=c.data),n.get(c)}function a(c){c.isInterleavedBufferAttribute&&(c=c.data);let h=n.get(c);h&&(i.deleteBuffer(h.buffer),n.delete(c))}function l(c,h){if(c.isGLBufferAttribute){let f=n.get(c);(!f||f.version<c.version)&&n.set(c,{buffer:c.buffer,type:c.type,bytesPerElement:c.elementSize,version:c.version});return}c.isInterleavedBufferAttribute&&(c=c.data);let d=n.get(c);d===void 0?n.set(c,s(c,h)):d.version<c.version&&(r(d.buffer,c,h),d.version=c.version)}return{get:o,remove:a,update:l}}var oa=class i extends Ot{constructor(e=1,t=1,n=1,s=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:n,heightSegments:s};let r=e/2,o=t/2,a=Math.floor(n),l=Math.floor(s),c=a+1,h=l+1,d=e/a,f=t/l,m=[],g=[],_=[],p=[];for(let u=0;u<h;u++){let S=u*f-o;for(let y=0;y<c;y++){let R=y*d-r;g.push(R,-S,0),_.push(0,0,1),p.push(y/a),p.push(1-u/l)}}for(let u=0;u<l;u++)for(let S=0;S<a;S++){let y=S+c*u,R=S+c*(u+1),w=S+1+c*(u+1),P=S+1+c*u;m.push(y,R,P),m.push(R,w,P)}this.setIndex(m),this.setAttribute("position",new mt(g,3)),this.setAttribute("normal",new mt(_,3)),this.setAttribute("uv",new mt(p,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new i(e.width,e.height,e.widthSegments,e.heightSegments)}},uh=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,dh=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,fh=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,ph=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,mh=`#ifdef USE_ALPHATEST
	if ( diffuseColor.a < alphaTest ) discard;
#endif`,gh=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,_h=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,xh=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,yh=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,vh=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,Mh=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,bh=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,Sh=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = dFdx( surf_pos.xyz );
		vec3 vSigmaY = dFdy( surf_pos.xyz );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,wh=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#pragma unroll_loop_start
	for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
		plane = clippingPlanes[ i ];
		if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
	}
	#pragma unroll_loop_end
	#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
		bool clipped = true;
		#pragma unroll_loop_start
		for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
		}
		#pragma unroll_loop_end
		if ( clipped ) discard;
	#endif
#endif`,Eh=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,Th=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,Ah=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,Rh=`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,Ch=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,Ph=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
	varying vec3 vColor;
#endif`,Lh=`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif`,Ih=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
struct GeometricContext {
	vec3 position;
	vec3 normal;
	vec3 viewDir;
#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal;
#endif
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
float luminance( const in vec3 rgb ) {
	const vec3 weights = vec3( 0.2126729, 0.7151522, 0.0721750 );
	return dot( weights, rgb );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,Dh=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_v0 0.339
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_v1 0.276
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_v4 0.046
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_v5 0.016
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_v6 0.0038
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,Uh=`vec3 transformedNormal = objectNormal;
#ifdef USE_INSTANCING
	mat3 m = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( m[ 0 ], m[ 0 ] ), dot( m[ 1 ], m[ 1 ] ), dot( m[ 2 ], m[ 2 ] ) );
	transformedNormal = m * transformedNormal;
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	vec3 transformedTangent = ( modelViewMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,Oh=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,Nh=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,Fh=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,zh=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Bh="gl_FragColor = linearToOutputTexel( gl_FragColor );",kh=`vec4 LinearToLinear( in vec4 value ) {
	return value;
}
vec4 LinearTosRGB( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,Vh=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,Hh=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,Gh=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,Wh=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Xh=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,qh=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Yh=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Zh=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,jh=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Jh=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,$h=`#ifdef USE_LIGHTMAP
	vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
	vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
	reflectedLight.indirectDiffuse += lightMapIrradiance;
#endif`,Kh=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,Qh=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,eu=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in GeometricContext geometry, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometry.normal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in GeometricContext geometry, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,tu=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
uniform vec3 lightProbe[ 9 ];
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	#if defined ( LEGACY_LIGHTS )
		if ( cutoffDistance > 0.0 && decayExponent > 0.0 ) {
			return pow( saturate( - lightDistance / cutoffDistance + 1.0 ), decayExponent );
		}
		return 1.0;
	#else
		float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
		if ( cutoffDistance > 0.0 ) {
			distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
		}
		return distanceFalloff;
	#endif
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, const in GeometricContext geometry, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in GeometricContext geometry, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometry.position;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in GeometricContext geometry, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometry.position;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,nu=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,iu=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,su=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in GeometricContext geometry, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometry.normal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in GeometricContext geometry, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,ru=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,au=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in GeometricContext geometry, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometry.normal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometry.viewDir, geometry.normal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in GeometricContext geometry, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,ou=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
vec3 dxy = max( abs( dFdx( geometryNormal ) ), abs( dFdy( geometryNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	anisotropyV /= material.anisotropy;
	material.anisotropy = saturate( material.anisotropy );
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x - tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x + tbn[ 0 ] * anisotropyV.y;
#endif`,lu=`struct PhysicalMaterial {
	vec3 diffuseColor;
	float roughness;
	vec3 specularColor;
	float specularF90;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecular = vec3( 0.0 );
vec3 sheenSpecular = vec3( 0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return saturate(v);
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColor;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
	return saturate( DG * RECIPROCAL_PI );
}
vec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;
	return fab;
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometry.normal;
		vec3 viewDir = geometry.viewDir;
		vec3 position = geometry.position;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometry.normal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometry.clearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecular += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometry.viewDir, geometry.clearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
		sheenSpecular += irradiance * BRDF_Sheen( directLight.direction, geometry.viewDir, geometry.normal, material.sheenColor, material.sheenRoughness );
	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometry.viewDir, geometry.normal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecular += clearcoatRadiance * EnvironmentBRDF( geometry.clearcoatNormal, geometry.viewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecular += irradiance * material.sheenColor * IBLSheenBRDF( geometry.normal, geometry.viewDir, material.sheenRoughness );
	#endif
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometry.normal, geometry.viewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );
	#else
		computeMultiscattering( geometry.normal, geometry.viewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );
	#endif
	vec3 totalScattering = singleScattering + multiScattering;
	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );
	reflectedLight.indirectSpecular += radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,cu=`
GeometricContext geometry;
geometry.position = - vViewPosition;
geometry.normal = normal;
geometry.viewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
#ifdef USE_CLEARCOAT
	geometry.clearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometry.viewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometry, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometry, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometry, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometry, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, geometry, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometry, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometry, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	irradiance += getLightProbeIrradiance( lightProbe, geometry.normal );
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometry.normal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,hu=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometry.normal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometry.viewDir, geometry.normal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometry.viewDir, geometry.normal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometry.viewDir, geometry.clearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,uu=`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometry, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometry, material, reflectedLight );
#endif`,du=`#if defined( USE_LOGDEPTHBUF ) && defined( USE_LOGDEPTHBUF_EXT )
	gl_FragDepthEXT = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,fu=`#if defined( USE_LOGDEPTHBUF ) && defined( USE_LOGDEPTHBUF_EXT )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,pu=`#ifdef USE_LOGDEPTHBUF
	#ifdef USE_LOGDEPTHBUF_EXT
		varying float vFragDepth;
		varying float vIsPerspective;
	#else
		uniform float logDepthBufFC;
	#endif
#endif`,mu=`#ifdef USE_LOGDEPTHBUF
	#ifdef USE_LOGDEPTHBUF_EXT
		vFragDepth = 1.0 + gl_Position.w;
		vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
	#else
		if ( isPerspectiveMatrix( projectionMatrix ) ) {
			gl_Position.z = log2( max( EPSILON, gl_Position.w + 1.0 ) ) * logDepthBufFC - 1.0;
			gl_Position.z *= gl_Position.w;
		}
	#endif
#endif`,gu=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
	
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,_u=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,xu=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,yu=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,vu=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,Mu=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,bu=`#if defined( USE_MORPHCOLORS ) && defined( MORPHTARGETS_TEXTURE )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,Su=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	#ifdef MORPHTARGETS_TEXTURE
		for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
			if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
		}
	#else
		objectNormal += morphNormal0 * morphTargetInfluences[ 0 ];
		objectNormal += morphNormal1 * morphTargetInfluences[ 1 ];
		objectNormal += morphNormal2 * morphTargetInfluences[ 2 ];
		objectNormal += morphNormal3 * morphTargetInfluences[ 3 ];
	#endif
#endif`,wu=`#ifdef USE_MORPHTARGETS
	uniform float morphTargetBaseInfluence;
	#ifdef MORPHTARGETS_TEXTURE
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
		uniform sampler2DArray morphTargetsTexture;
		uniform ivec2 morphTargetsTextureSize;
		vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
			int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
			int y = texelIndex / morphTargetsTextureSize.x;
			int x = texelIndex - y * morphTargetsTextureSize.x;
			ivec3 morphUV = ivec3( x, y, morphTargetIndex );
			return texelFetch( morphTargetsTexture, morphUV, 0 );
		}
	#else
		#ifndef USE_MORPHNORMALS
			uniform float morphTargetInfluences[ 8 ];
		#else
			uniform float morphTargetInfluences[ 4 ];
		#endif
	#endif
#endif`,Eu=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	#ifdef MORPHTARGETS_TEXTURE
		for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
			if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
		}
	#else
		transformed += morphTarget0 * morphTargetInfluences[ 0 ];
		transformed += morphTarget1 * morphTargetInfluences[ 1 ];
		transformed += morphTarget2 * morphTargetInfluences[ 2 ];
		transformed += morphTarget3 * morphTargetInfluences[ 3 ];
		#ifndef USE_MORPHNORMALS
			transformed += morphTarget4 * morphTargetInfluences[ 4 ];
			transformed += morphTarget5 * morphTargetInfluences[ 5 ];
			transformed += morphTarget6 * morphTargetInfluences[ 6 ];
			transformed += morphTarget7 * morphTargetInfluences[ 7 ];
		#endif
	#endif
#endif`,Tu=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 geometryNormal = normal;`,Au=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,Ru=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Cu=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Pu=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,Lu=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,Iu=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = geometryNormal;
#endif`,Du=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,Uu=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,Ou=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,Nu=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,Fu=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;
const vec3 PackFactors = vec3( 256. * 256. * 256., 256. * 256., 256. );
const vec4 UnpackFactors = UnpackDownscale / vec4( PackFactors, 1. );
const float ShiftRight8 = 1. / 256.;
vec4 packDepthToRGBA( const in float v ) {
	vec4 r = vec4( fract( v * PackFactors ), v );
	r.yzw -= r.xyz * ShiftRight8;	return r * PackUpscale;
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors );
}
vec2 packDepthToRG( in highp float v ) {
	return packDepthToRGBA( v ).yx;
}
float unpackRGToDepth( const in highp vec2 v ) {
	return unpackRGBAToDepth( vec4( v.xy, 0.0, 0.0 ) );
}
vec4 pack2HalfToRGBA( vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,zu=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,Bu=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,ku=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,Vu=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,Hu=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,Gu=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,Wu=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		struct SpotLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		return step( compare, unpackRGBAToDepth( texture2D( depths, uv ) ) );
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow (sampler2D shadow, vec2 uv, float compare ){
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		float hard_shadow = step( compare , distribution.x );
		if (hard_shadow != 1.0 ) {
			float distance = compare - distribution.x ;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return shadow;
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
		vec3 lightToPosition = shadowCoord.xyz;
		float dp = ( length( lightToPosition ) - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );		dp += shadowBias;
		vec3 bd3D = normalize( lightToPosition );
		#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
			vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
			return (
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
			) * ( 1.0 / 9.0 );
		#else
			return texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
		#endif
	}
#endif`,Xu=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,qu=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,Yu=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,Zu=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,ju=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	uniform int boneTextureSize;
	mat4 getBoneMatrix( const in float i ) {
		float j = i * 4.0;
		float x = mod( j, float( boneTextureSize ) );
		float y = floor( j / float( boneTextureSize ) );
		float dx = 1.0 / float( boneTextureSize );
		float dy = 1.0 / float( boneTextureSize );
		y = dy * ( y + 0.5 );
		vec4 v1 = texture2D( boneTexture, vec2( dx * ( x + 0.5 ), y ) );
		vec4 v2 = texture2D( boneTexture, vec2( dx * ( x + 1.5 ), y ) );
		vec4 v3 = texture2D( boneTexture, vec2( dx * ( x + 2.5 ), y ) );
		vec4 v4 = texture2D( boneTexture, vec2( dx * ( x + 3.5 ), y ) );
		mat4 bone = mat4( v1, v2, v3, v4 );
		return bone;
	}
#endif`,Ju=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,$u=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,Ku=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,Qu=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,ed=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,td=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 OptimizedCineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,nd=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,id=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
		vec3 refractedRayExit = position + transmissionRay;
		vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
		vec2 refractionCoords = ndcPos.xy / ndcPos.w;
		refractionCoords += 1.0;
		refractionCoords /= 2.0;
		vec4 transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
		vec3 transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,sd=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,rd=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,ad=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,od=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,ld=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,cd=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,hd=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,ud=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,dd=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,fd=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,pd=`#include <common>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <skinbase_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,md=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( 1.0 );
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#endif
}`,gd=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <skinbase_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,_d=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( 1.0 );
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}`,xd=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,yd=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,vd=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,Md=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,bd=`#include <common>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,Sd=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,wd=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Ed=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Td=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,Ad=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Rd=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,Cd=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <packing>
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( packNormalToRGB( normal ), opacity );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,Pd=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Ld=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Id=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,Dd=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );
		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecular;
	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometry.clearcoatNormal, geometry.viewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + clearcoatSpecular * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Ud=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Od=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Nd=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,Fd=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,zd=`#include <common>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Bd=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,kd=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
	vec2 scale;
	scale.x = length( vec3( modelMatrix[ 0 ].x, modelMatrix[ 0 ].y, modelMatrix[ 0 ].z ) );
	scale.y = length( vec3( modelMatrix[ 1 ].x, modelMatrix[ 1 ].y, modelMatrix[ 1 ].z ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,Vd=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,Le={alphahash_fragment:uh,alphahash_pars_fragment:dh,alphamap_fragment:fh,alphamap_pars_fragment:ph,alphatest_fragment:mh,alphatest_pars_fragment:gh,aomap_fragment:_h,aomap_pars_fragment:xh,begin_vertex:yh,beginnormal_vertex:vh,bsdfs:Mh,iridescence_fragment:bh,bumpmap_pars_fragment:Sh,clipping_planes_fragment:wh,clipping_planes_pars_fragment:Eh,clipping_planes_pars_vertex:Th,clipping_planes_vertex:Ah,color_fragment:Rh,color_pars_fragment:Ch,color_pars_vertex:Ph,color_vertex:Lh,common:Ih,cube_uv_reflection_fragment:Dh,defaultnormal_vertex:Uh,displacementmap_pars_vertex:Oh,displacementmap_vertex:Nh,emissivemap_fragment:Fh,emissivemap_pars_fragment:zh,colorspace_fragment:Bh,colorspace_pars_fragment:kh,envmap_fragment:Vh,envmap_common_pars_fragment:Hh,envmap_pars_fragment:Gh,envmap_pars_vertex:Wh,envmap_physical_pars_fragment:nu,envmap_vertex:Xh,fog_vertex:qh,fog_pars_vertex:Yh,fog_fragment:Zh,fog_pars_fragment:jh,gradientmap_pars_fragment:Jh,lightmap_fragment:$h,lightmap_pars_fragment:Kh,lights_lambert_fragment:Qh,lights_lambert_pars_fragment:eu,lights_pars_begin:tu,lights_toon_fragment:iu,lights_toon_pars_fragment:su,lights_phong_fragment:ru,lights_phong_pars_fragment:au,lights_physical_fragment:ou,lights_physical_pars_fragment:lu,lights_fragment_begin:cu,lights_fragment_maps:hu,lights_fragment_end:uu,logdepthbuf_fragment:du,logdepthbuf_pars_fragment:fu,logdepthbuf_pars_vertex:pu,logdepthbuf_vertex:mu,map_fragment:gu,map_pars_fragment:_u,map_particle_fragment:xu,map_particle_pars_fragment:yu,metalnessmap_fragment:vu,metalnessmap_pars_fragment:Mu,morphcolor_vertex:bu,morphnormal_vertex:Su,morphtarget_pars_vertex:wu,morphtarget_vertex:Eu,normal_fragment_begin:Tu,normal_fragment_maps:Au,normal_pars_fragment:Ru,normal_pars_vertex:Cu,normal_vertex:Pu,normalmap_pars_fragment:Lu,clearcoat_normal_fragment_begin:Iu,clearcoat_normal_fragment_maps:Du,clearcoat_pars_fragment:Uu,iridescence_pars_fragment:Ou,opaque_fragment:Nu,packing:Fu,premultiplied_alpha_fragment:zu,project_vertex:Bu,dithering_fragment:ku,dithering_pars_fragment:Vu,roughnessmap_fragment:Hu,roughnessmap_pars_fragment:Gu,shadowmap_pars_fragment:Wu,shadowmap_pars_vertex:Xu,shadowmap_vertex:qu,shadowmask_pars_fragment:Yu,skinbase_vertex:Zu,skinning_pars_vertex:ju,skinning_vertex:Ju,skinnormal_vertex:$u,specularmap_fragment:Ku,specularmap_pars_fragment:Qu,tonemapping_fragment:ed,tonemapping_pars_fragment:td,transmission_fragment:nd,transmission_pars_fragment:id,uv_pars_fragment:sd,uv_pars_vertex:rd,uv_vertex:ad,worldpos_vertex:od,background_vert:ld,background_frag:cd,backgroundCube_vert:hd,backgroundCube_frag:ud,cube_vert:dd,cube_frag:fd,depth_vert:pd,depth_frag:md,distanceRGBA_vert:gd,distanceRGBA_frag:_d,equirect_vert:xd,equirect_frag:yd,linedashed_vert:vd,linedashed_frag:Md,meshbasic_vert:bd,meshbasic_frag:Sd,meshlambert_vert:wd,meshlambert_frag:Ed,meshmatcap_vert:Td,meshmatcap_frag:Ad,meshnormal_vert:Rd,meshnormal_frag:Cd,meshphong_vert:Pd,meshphong_frag:Ld,meshphysical_vert:Id,meshphysical_frag:Dd,meshtoon_vert:Ud,meshtoon_frag:Od,points_vert:Nd,points_frag:Fd,shadow_vert:zd,shadow_frag:Bd,sprite_vert:kd,sprite_frag:Vd},oe={common:{diffuse:{value:new ze(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new De},alphaMap:{value:null},alphaMapTransform:{value:new De},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new De}},envmap:{envMap:{value:null},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new De}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new De}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new De},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new De},normalScale:{value:new me(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new De},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new De}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new De}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new De}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new ze(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new ze(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new De},alphaTest:{value:0},uvTransform:{value:new De}},sprite:{diffuse:{value:new ze(16777215)},opacity:{value:1},center:{value:new me(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new De},alphaMap:{value:null},alphaMapTransform:{value:new De},alphaTest:{value:0}}},Qt={basic:{uniforms:wt([oe.common,oe.specularmap,oe.envmap,oe.aomap,oe.lightmap,oe.fog]),vertexShader:Le.meshbasic_vert,fragmentShader:Le.meshbasic_frag},lambert:{uniforms:wt([oe.common,oe.specularmap,oe.envmap,oe.aomap,oe.lightmap,oe.emissivemap,oe.bumpmap,oe.normalmap,oe.displacementmap,oe.fog,oe.lights,{emissive:{value:new ze(0)}}]),vertexShader:Le.meshlambert_vert,fragmentShader:Le.meshlambert_frag},phong:{uniforms:wt([oe.common,oe.specularmap,oe.envmap,oe.aomap,oe.lightmap,oe.emissivemap,oe.bumpmap,oe.normalmap,oe.displacementmap,oe.fog,oe.lights,{emissive:{value:new ze(0)},specular:{value:new ze(1118481)},shininess:{value:30}}]),vertexShader:Le.meshphong_vert,fragmentShader:Le.meshphong_frag},standard:{uniforms:wt([oe.common,oe.envmap,oe.aomap,oe.lightmap,oe.emissivemap,oe.bumpmap,oe.normalmap,oe.displacementmap,oe.roughnessmap,oe.metalnessmap,oe.fog,oe.lights,{emissive:{value:new ze(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Le.meshphysical_vert,fragmentShader:Le.meshphysical_frag},toon:{uniforms:wt([oe.common,oe.aomap,oe.lightmap,oe.emissivemap,oe.bumpmap,oe.normalmap,oe.displacementmap,oe.gradientmap,oe.fog,oe.lights,{emissive:{value:new ze(0)}}]),vertexShader:Le.meshtoon_vert,fragmentShader:Le.meshtoon_frag},matcap:{uniforms:wt([oe.common,oe.bumpmap,oe.normalmap,oe.displacementmap,oe.fog,{matcap:{value:null}}]),vertexShader:Le.meshmatcap_vert,fragmentShader:Le.meshmatcap_frag},points:{uniforms:wt([oe.points,oe.fog]),vertexShader:Le.points_vert,fragmentShader:Le.points_frag},dashed:{uniforms:wt([oe.common,oe.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Le.linedashed_vert,fragmentShader:Le.linedashed_frag},depth:{uniforms:wt([oe.common,oe.displacementmap]),vertexShader:Le.depth_vert,fragmentShader:Le.depth_frag},normal:{uniforms:wt([oe.common,oe.bumpmap,oe.normalmap,oe.displacementmap,{opacity:{value:1}}]),vertexShader:Le.meshnormal_vert,fragmentShader:Le.meshnormal_frag},sprite:{uniforms:wt([oe.sprite,oe.fog]),vertexShader:Le.sprite_vert,fragmentShader:Le.sprite_frag},background:{uniforms:{uvTransform:{value:new De},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Le.background_vert,fragmentShader:Le.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1}},vertexShader:Le.backgroundCube_vert,fragmentShader:Le.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Le.cube_vert,fragmentShader:Le.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Le.equirect_vert,fragmentShader:Le.equirect_frag},distanceRGBA:{uniforms:wt([oe.common,oe.displacementmap,{referencePosition:{value:new L},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Le.distanceRGBA_vert,fragmentShader:Le.distanceRGBA_frag},shadow:{uniforms:wt([oe.lights,oe.fog,{color:{value:new ze(0)},opacity:{value:1}}]),vertexShader:Le.shadow_vert,fragmentShader:Le.shadow_frag}};Qt.physical={uniforms:wt([Qt.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new De},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new De},clearcoatNormalScale:{value:new me(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new De},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new De},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new De},sheen:{value:0},sheenColor:{value:new ze(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new De},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new De},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new De},transmissionSamplerSize:{value:new me},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new De},attenuationDistance:{value:0},attenuationColor:{value:new ze(0)},specularColor:{value:new ze(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new De},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new De},anisotropyVector:{value:new me},anisotropyMap:{value:null},anisotropyMapTransform:{value:new De}}]),vertexShader:Le.meshphysical_vert,fragmentShader:Le.meshphysical_frag};var ws={r:0,b:0,g:0};function Hd(i,e,t,n,s,r,o){let a=new ze(0),l=r===!0?0:1,c,h,d=null,f=0,m=null;function g(p,u){let S=!1,y=u.isScene===!0?u.background:null;y&&y.isTexture&&(y=(u.backgroundBlurriness>0?t:e).get(y)),y===null?_(a,l):y&&y.isColor&&(_(y,1),S=!0);let R=i.xr.getEnvironmentBlendMode();R==="additive"?n.buffers.color.setClear(0,0,0,1,o):R==="alpha-blend"&&n.buffers.color.setClear(0,0,0,0,o),(i.autoClear||S)&&i.clear(i.autoClearColor,i.autoClearDepth,i.autoClearStencil),y&&(y.isCubeTexture||y.mapping===$s)?(h===void 0&&(h=new Ge(new et(1,1,1),new Bt({name:"BackgroundCubeMaterial",uniforms:Ei(Qt.backgroundCube.uniforms),vertexShader:Qt.backgroundCube.vertexShader,fragmentShader:Qt.backgroundCube.fragmentShader,side:Tt,depthTest:!1,depthWrite:!1,fog:!1})),h.geometry.deleteAttribute("normal"),h.geometry.deleteAttribute("uv"),h.onBeforeRender=function(w,P,T){this.matrixWorld.copyPosition(T.matrixWorld)},Object.defineProperty(h.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),s.update(h)),h.material.uniforms.envMap.value=y,h.material.uniforms.flipEnvMap.value=y.isCubeTexture&&y.isRenderTargetTexture===!1?-1:1,h.material.uniforms.backgroundBlurriness.value=u.backgroundBlurriness,h.material.uniforms.backgroundIntensity.value=u.backgroundIntensity,h.material.toneMapped=y.colorSpace!==Xe,(d!==y||f!==y.version||m!==i.toneMapping)&&(h.material.needsUpdate=!0,d=y,f=y.version,m=i.toneMapping),h.layers.enableAll(),p.unshift(h,h.geometry,h.material,0,0,null)):y&&y.isTexture&&(c===void 0&&(c=new Ge(new oa(2,2),new Bt({name:"BackgroundMaterial",uniforms:Ei(Qt.background.uniforms),vertexShader:Qt.background.vertexShader,fragmentShader:Qt.background.fragmentShader,side:Dt,depthTest:!1,depthWrite:!1,fog:!1})),c.geometry.deleteAttribute("normal"),Object.defineProperty(c.material,"map",{get:function(){return this.uniforms.t2D.value}}),s.update(c)),c.material.uniforms.t2D.value=y,c.material.uniforms.backgroundIntensity.value=u.backgroundIntensity,c.material.toneMapped=y.colorSpace!==Xe,y.matrixAutoUpdate===!0&&y.updateMatrix(),c.material.uniforms.uvTransform.value.copy(y.matrix),(d!==y||f!==y.version||m!==i.toneMapping)&&(c.material.needsUpdate=!0,d=y,f=y.version,m=i.toneMapping),c.layers.enableAll(),p.unshift(c,c.geometry,c.material,0,0,null))}function _(p,u){p.getRGB(ws,X0(i)),n.buffers.color.setClear(ws.r,ws.g,ws.b,u,o)}return{getClearColor:function(){return a},setClearColor:function(p,u=1){a.set(p),l=u,_(a,l)},getClearAlpha:function(){return l},setClearAlpha:function(p){l=p,_(a,l)},render:g}}function Gd(i,e,t,n){let s=i.getParameter(i.MAX_VERTEX_ATTRIBS),r=n.isWebGL2?null:e.get("OES_vertex_array_object"),o=n.isWebGL2||r!==null,a={},l=p(null),c=l,h=!1;function d(H,V,K,X,q){let J=!1;if(o){let $=_(X,K,V);c!==$&&(c=$,m(c.object)),J=u(H,X,K,q),J&&S(H,X,K,q)}else{let $=V.wireframe===!0;(c.geometry!==X.id||c.program!==K.id||c.wireframe!==$)&&(c.geometry=X.id,c.program=K.id,c.wireframe=$,J=!0)}q!==null&&t.update(q,i.ELEMENT_ARRAY_BUFFER),(J||h)&&(h=!1,k(H,V,K,X),q!==null&&i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,t.get(q).buffer))}function f(){return n.isWebGL2?i.createVertexArray():r.createVertexArrayOES()}function m(H){return n.isWebGL2?i.bindVertexArray(H):r.bindVertexArrayOES(H)}function g(H){return n.isWebGL2?i.deleteVertexArray(H):r.deleteVertexArrayOES(H)}function _(H,V,K){let X=K.wireframe===!0,q=a[H.id];q===void 0&&(q={},a[H.id]=q);let J=q[V.id];J===void 0&&(J={},q[V.id]=J);let $=J[X];return $===void 0&&($=p(f()),J[X]=$),$}function p(H){let V=[],K=[],X=[];for(let q=0;q<s;q++)V[q]=0,K[q]=0,X[q]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:V,enabledAttributes:K,attributeDivisors:X,object:H,attributes:{},index:null}}function u(H,V,K,X){let q=c.attributes,J=V.attributes,$=0,O=K.getAttributes();for(let Y in O)if(O[Y].location>=0){let de=q[Y],fe=J[Y];if(fe===void 0&&(Y==="instanceMatrix"&&H.instanceMatrix&&(fe=H.instanceMatrix),Y==="instanceColor"&&H.instanceColor&&(fe=H.instanceColor)),de===void 0||de.attribute!==fe||fe&&de.data!==fe.data)return!0;$++}return c.attributesNum!==$||c.index!==X}function S(H,V,K,X){let q={},J=V.attributes,$=0,O=K.getAttributes();for(let Y in O)if(O[Y].location>=0){let de=J[Y];de===void 0&&(Y==="instanceMatrix"&&H.instanceMatrix&&(de=H.instanceMatrix),Y==="instanceColor"&&H.instanceColor&&(de=H.instanceColor));let fe={};fe.attribute=de,de&&de.data&&(fe.data=de.data),q[Y]=fe,$++}c.attributes=q,c.attributesNum=$,c.index=X}function y(){let H=c.newAttributes;for(let V=0,K=H.length;V<K;V++)H[V]=0}function R(H){w(H,0)}function w(H,V){let K=c.newAttributes,X=c.enabledAttributes,q=c.attributeDivisors;K[H]=1,X[H]===0&&(i.enableVertexAttribArray(H),X[H]=1),q[H]!==V&&((n.isWebGL2?i:e.get("ANGLE_instanced_arrays"))[n.isWebGL2?"vertexAttribDivisor":"vertexAttribDivisorANGLE"](H,V),q[H]=V)}function P(){let H=c.newAttributes,V=c.enabledAttributes;for(let K=0,X=V.length;K<X;K++)V[K]!==H[K]&&(i.disableVertexAttribArray(K),V[K]=0)}function T(H,V,K,X,q,J,$){$===!0?i.vertexAttribIPointer(H,V,K,q,J):i.vertexAttribPointer(H,V,K,X,q,J)}function k(H,V,K,X){if(n.isWebGL2===!1&&(H.isInstancedMesh||X.isInstancedBufferGeometry)&&e.get("ANGLE_instanced_arrays")===null)return;y();let q=X.attributes,J=K.getAttributes(),$=V.defaultAttributeValues;for(let O in J){let Y=J[O];if(Y.location>=0){let ue=q[O];if(ue===void 0&&(O==="instanceMatrix"&&H.instanceMatrix&&(ue=H.instanceMatrix),O==="instanceColor"&&H.instanceColor&&(ue=H.instanceColor)),ue!==void 0){let de=ue.normalized,fe=ue.itemSize,ve=t.get(ue);if(ve===void 0)continue;let Ee=ve.buffer,_e=ve.type,ke=ve.bytesPerElement,pt=n.isWebGL2===!0&&(_e===i.INT||_e===i.UNSIGNED_INT||ue.gpuType===U0);if(ue.isInterleavedBufferAttribute){let Ce=ue.data,D=Ce.stride,at=ue.offset;if(Ce.isInstancedInterleavedBuffer){for(let xe=0;xe<Y.locationSize;xe++)w(Y.location+xe,Ce.meshPerAttribute);H.isInstancedMesh!==!0&&X._maxInstanceCount===void 0&&(X._maxInstanceCount=Ce.meshPerAttribute*Ce.count)}else for(let xe=0;xe<Y.locationSize;xe++)R(Y.location+xe);i.bindBuffer(i.ARRAY_BUFFER,Ee);for(let xe=0;xe<Y.locationSize;xe++)T(Y.location+xe,fe/Y.locationSize,_e,de,D*ke,(at+fe/Y.locationSize*xe)*ke,pt)}else{if(ue.isInstancedBufferAttribute){for(let Ce=0;Ce<Y.locationSize;Ce++)w(Y.location+Ce,ue.meshPerAttribute);H.isInstancedMesh!==!0&&X._maxInstanceCount===void 0&&(X._maxInstanceCount=ue.meshPerAttribute*ue.count)}else for(let Ce=0;Ce<Y.locationSize;Ce++)R(Y.location+Ce);i.bindBuffer(i.ARRAY_BUFFER,Ee);for(let Ce=0;Ce<Y.locationSize;Ce++)T(Y.location+Ce,fe/Y.locationSize,_e,de,fe*ke,fe/Y.locationSize*Ce*ke,pt)}}else if($!==void 0){let de=$[O];if(de!==void 0)switch(de.length){case 2:i.vertexAttrib2fv(Y.location,de);break;case 3:i.vertexAttrib3fv(Y.location,de);break;case 4:i.vertexAttrib4fv(Y.location,de);break;default:i.vertexAttrib1fv(Y.location,de)}}}}P()}function v(){te();for(let H in a){let V=a[H];for(let K in V){let X=V[K];for(let q in X)g(X[q].object),delete X[q];delete V[K]}delete a[H]}}function E(H){if(a[H.id]===void 0)return;let V=a[H.id];for(let K in V){let X=V[K];for(let q in X)g(X[q].object),delete X[q];delete V[K]}delete a[H.id]}function Z(H){for(let V in a){let K=a[V];if(K[H.id]===void 0)continue;let X=K[H.id];for(let q in X)g(X[q].object),delete X[q];delete K[H.id]}}function te(){F(),h=!0,c!==l&&(c=l,m(c.object))}function F(){l.geometry=null,l.program=null,l.wireframe=!1}return{setup:d,reset:te,resetDefaultState:F,dispose:v,releaseStatesOfGeometry:E,releaseStatesOfProgram:Z,initAttributes:y,enableAttribute:R,disableUnusedAttributes:P}}function Wd(i,e,t,n){let s=n.isWebGL2,r;function o(c){r=c}function a(c,h){i.drawArrays(r,c,h),t.update(h,r,1)}function l(c,h,d){if(d===0)return;let f,m;if(s)f=i,m="drawArraysInstanced";else if(f=e.get("ANGLE_instanced_arrays"),m="drawArraysInstancedANGLE",f===null){console.error("THREE.WebGLBufferRenderer: using THREE.InstancedBufferGeometry but hardware does not support extension ANGLE_instanced_arrays.");return}f[m](r,c,h,d),t.update(h,r,d)}this.setMode=o,this.render=a,this.renderInstances=l}function Xd(i,e,t){let n;function s(){if(n!==void 0)return n;if(e.has("EXT_texture_filter_anisotropic")===!0){let T=e.get("EXT_texture_filter_anisotropic");n=i.getParameter(T.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else n=0;return n}function r(T){if(T==="highp"){if(i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.HIGH_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.HIGH_FLOAT).precision>0)return"highp";T="mediump"}return T==="mediump"&&i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.MEDIUM_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let o=typeof WebGL2RenderingContext<"u"&&i.constructor.name==="WebGL2RenderingContext",a=t.precision!==void 0?t.precision:"highp",l=r(a);l!==a&&(console.warn("THREE.WebGLRenderer:",a,"not supported, using",l,"instead."),a=l);let c=o||e.has("WEBGL_draw_buffers"),h=t.logarithmicDepthBuffer===!0,d=i.getParameter(i.MAX_TEXTURE_IMAGE_UNITS),f=i.getParameter(i.MAX_VERTEX_TEXTURE_IMAGE_UNITS),m=i.getParameter(i.MAX_TEXTURE_SIZE),g=i.getParameter(i.MAX_CUBE_MAP_TEXTURE_SIZE),_=i.getParameter(i.MAX_VERTEX_ATTRIBS),p=i.getParameter(i.MAX_VERTEX_UNIFORM_VECTORS),u=i.getParameter(i.MAX_VARYING_VECTORS),S=i.getParameter(i.MAX_FRAGMENT_UNIFORM_VECTORS),y=f>0,R=o||e.has("OES_texture_float"),w=y&&R,P=o?i.getParameter(i.MAX_SAMPLES):0;return{isWebGL2:o,drawBuffers:c,getMaxAnisotropy:s,getMaxPrecision:r,precision:a,logarithmicDepthBuffer:h,maxTextures:d,maxVertexTextures:f,maxTextureSize:m,maxCubemapSize:g,maxAttributes:_,maxVertexUniforms:p,maxVaryings:u,maxFragmentUniforms:S,vertexTextures:y,floatFragmentTextures:R,floatVertexTextures:w,maxSamples:P}}function qd(i){let e=this,t=null,n=0,s=!1,r=!1,o=new Yt,a=new De,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(d,f){let m=d.length!==0||f||n!==0||s;return s=f,n=d.length,m},this.beginShadows=function(){r=!0,h(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(d,f){t=h(d,f,0)},this.setState=function(d,f,m){let g=d.clippingPlanes,_=d.clipIntersection,p=d.clipShadows,u=i.get(d);if(!s||g===null||g.length===0||r&&!p)r?h(null):c();else{let S=r?0:n,y=S*4,R=u.clippingState||null;l.value=R,R=h(g,f,y,m);for(let w=0;w!==y;++w)R[w]=t[w];u.clippingState=R,this.numIntersection=_?this.numPlanes:0,this.numPlanes+=S}};function c(){l.value!==t&&(l.value=t,l.needsUpdate=n>0),e.numPlanes=n,e.numIntersection=0}function h(d,f,m,g){let _=d!==null?d.length:0,p=null;if(_!==0){if(p=l.value,g!==!0||p===null){let u=m+_*4,S=f.matrixWorldInverse;a.getNormalMatrix(S),(p===null||p.length<u)&&(p=new Float32Array(u));for(let y=0,R=m;y!==_;++y,R+=4)o.copy(d[y]).applyMatrix4(S,a),o.normal.toArray(p,R),p[R+3]=o.constant}l.value=p,l.needsUpdate=!0}return e.numPlanes=_,e.numIntersection=0,p}}function Yd(i){let e=new WeakMap;function t(o,a){return a===Wi?o.mapping=bi:a===$r&&(o.mapping=Si),o}function n(o){if(o&&o.isTexture&&o.isRenderTargetTexture===!1){let a=o.mapping;if(a===Wi||a===$r)if(e.has(o)){let l=e.get(o).texture;return t(l,o.mapping)}else{let l=o.image;if(l&&l.height>0){let c=new aa(l.height/2);return c.fromEquirectangularTexture(i,o),e.set(o,c),o.addEventListener("dispose",s),t(c.texture,o.mapping)}else return null}}return o}function s(o){let a=o.target;a.removeEventListener("dispose",s);let l=e.get(a);l!==void 0&&(e.delete(a),l.dispose())}function r(){e=new WeakMap}return{get:n,dispose:r}}var Ji=class extends Gs{constructor(e=-1,t=1,n=1,s=-1,r=.1,o=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=s,this.near=r,this.far=o,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,s,r,o){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,s=(this.top+this.bottom)/2,r=n-e,o=n+e,a=s+t,l=s-t;if(this.view!==null&&this.view.enabled){let c=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,o=r+c*this.view.width,a-=h*this.view.offsetY,l=a-h*this.view.height}this.projectionMatrix.makeOrthographic(r,o,a,l,this.near,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}},xi=4,n0=[.125,.215,.35,.446,.526,.582],zn=20,Wr=new Ji,i0=new ze,Xr=null,Fn=(1+Math.sqrt(5))/2,di=1/Fn,s0=[new L(1,1,1),new L(-1,1,1),new L(1,1,-1),new L(-1,1,-1),new L(0,Fn,di),new L(0,Fn,-di),new L(di,0,Fn),new L(-di,0,Fn),new L(Fn,di,0),new L(-Fn,di,0)],Xs=class{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._lodPlanes=[],this._sizeLods=[],this._sigmas=[],this._blurMaterial=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._compileMaterial(this._blurMaterial)}fromScene(e,t=0,n=.1,s=100){Xr=this._renderer.getRenderTarget(),this._setSize(256);let r=this._allocateTargets();return r.depthBuffer=!0,this._sceneToCubeUV(e,n,s,r),t>0&&this._blur(r,0,0,t),this._applyPMREM(r),this._cleanup(r),r}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=o0(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=a0(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose()}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodPlanes.length;e++)this._lodPlanes[e].dispose()}_cleanup(e){this._renderer.setRenderTarget(Xr),e.scissorTest=!1,Es(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===bi||e.mapping===Si?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),Xr=this._renderer.getRenderTarget();let n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:zt,minFilter:zt,generateMipmaps:!1,type:Wn,format:jt,colorSpace:sn,depthBuffer:!1},s=r0(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=r0(e,t,n);let{_lodMax:r}=this;({sizeLods:this._sizeLods,lodPlanes:this._lodPlanes,sigmas:this._sigmas}=Zd(r)),this._blurMaterial=jd(r,e,t)}return s}_compileMaterial(e){let t=new Ge(this._lodPlanes[0],e);this._renderer.compile(t,Wr)}_sceneToCubeUV(e,t,n,s){let a=new yt(90,1,t,n),l=[1,-1,1,1,1,1],c=[1,1,1,-1,-1,-1],h=this._renderer,d=h.autoClear,f=h.toneMapping;h.getClearColor(i0),h.toneMapping=Tn,h.autoClear=!1;let m=new ks({name:"PMREM.Background",side:Tt,depthWrite:!1,depthTest:!1}),g=new Ge(new et,m),_=!1,p=e.background;p?p.isColor&&(m.color.copy(p),e.background=null,_=!0):(m.color.copy(i0),_=!0);for(let u=0;u<6;u++){let S=u%3;S===0?(a.up.set(0,l[u],0),a.lookAt(c[u],0,0)):S===1?(a.up.set(0,0,l[u]),a.lookAt(0,c[u],0)):(a.up.set(0,l[u],0),a.lookAt(0,0,c[u]));let y=this._cubeSize;Es(s,S*y,u>2?y:0,y,y),h.setRenderTarget(s),_&&h.render(g,a),h.render(e,a)}g.geometry.dispose(),g.material.dispose(),h.toneMapping=f,h.autoClear=d,e.background=p}_textureToCubeUV(e,t){let n=this._renderer,s=e.mapping===bi||e.mapping===Si;s?(this._cubemapMaterial===null&&(this._cubemapMaterial=o0()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=a0());let r=s?this._cubemapMaterial:this._equirectMaterial,o=new Ge(this._lodPlanes[0],r),a=r.uniforms;a.envMap.value=e;let l=this._cubeSize;Es(t,0,0,3*l,2*l),n.setRenderTarget(t),n.render(o,Wr)}_applyPMREM(e){let t=this._renderer,n=t.autoClear;t.autoClear=!1;for(let s=1;s<this._lodPlanes.length;s++){let r=Math.sqrt(this._sigmas[s]*this._sigmas[s]-this._sigmas[s-1]*this._sigmas[s-1]),o=s0[(s-1)%s0.length];this._blur(e,s-1,s,r,o)}t.autoClear=n}_blur(e,t,n,s,r){let o=this._pingPongRenderTarget;this._halfBlur(e,o,t,n,s,"latitudinal",r),this._halfBlur(o,e,n,n,s,"longitudinal",r)}_halfBlur(e,t,n,s,r,o,a){let l=this._renderer,c=this._blurMaterial;o!=="latitudinal"&&o!=="longitudinal"&&console.error("blur direction must be either latitudinal or longitudinal!");let h=3,d=new Ge(this._lodPlanes[s],c),f=c.uniforms,m=this._sizeLods[n]-1,g=isFinite(r)?Math.PI/(2*m):2*Math.PI/(2*zn-1),_=r/g,p=isFinite(r)?1+Math.floor(h*_):zn;p>zn&&console.warn(`sigmaRadians, ${r}, is too large and will clip, as it requested ${p} samples when the maximum is set to ${zn}`);let u=[],S=0;for(let T=0;T<zn;++T){let k=T/_,v=Math.exp(-k*k/2);u.push(v),T===0?S+=v:T<p&&(S+=2*v)}for(let T=0;T<u.length;T++)u[T]=u[T]/S;f.envMap.value=e.texture,f.samples.value=p,f.weights.value=u,f.latitudinal.value=o==="latitudinal",a&&(f.poleAxis.value=a);let{_lodMax:y}=this;f.dTheta.value=g,f.mipInt.value=y-n;let R=this._sizeLods[s],w=3*R*(s>y-xi?s-y+xi:0),P=4*(this._cubeSize-R);Es(t,w,P,3*R,2*R),l.setRenderTarget(t),l.render(d,Wr)}};function Zd(i){let e=[],t=[],n=[],s=i,r=i-xi+1+n0.length;for(let o=0;o<r;o++){let a=Math.pow(2,s);t.push(a);let l=1/a;o>i-xi?l=n0[o-i+xi-1]:o===0&&(l=0),n.push(l);let c=1/(a-2),h=-c,d=1+c,f=[h,h,d,h,d,d,h,h,d,d,h,d],m=6,g=6,_=3,p=2,u=1,S=new Float32Array(_*g*m),y=new Float32Array(p*g*m),R=new Float32Array(u*g*m);for(let P=0;P<m;P++){let T=P%3*2/3-1,k=P>2?0:-1,v=[T,k,0,T+2/3,k,0,T+2/3,k+1,0,T,k,0,T+2/3,k+1,0,T,k+1,0];S.set(v,_*g*P),y.set(f,p*g*P);let E=[P,P,P,P,P,P];R.set(E,u*g*P)}let w=new Ot;w.setAttribute("position",new It(S,_)),w.setAttribute("uv",new It(y,p)),w.setAttribute("faceIndex",new It(R,u)),e.push(w),s>xi&&s--}return{lodPlanes:e,sizeLods:t,sigmas:n}}function r0(i,e,t){let n=new Ut(i,e,t);return n.texture.mapping=$s,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function Es(i,e,t,n,s){i.viewport.set(e,t,n,s),i.scissor.set(e,t,n,s)}function jd(i,e,t){let n=new Float32Array(zn),s=new L(0,1,0);return new Bt({name:"SphericalGaussianBlur",defines:{n:zn,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:s}},vertexShader:Oa(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:nn,depthTest:!1,depthWrite:!1})}function a0(){return new Bt({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Oa(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:nn,depthTest:!1,depthWrite:!1})}function o0(){return new Bt({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Oa(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:nn,depthTest:!1,depthWrite:!1})}function Oa(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}function Jd(i){let e=new WeakMap,t=null;function n(a){if(a&&a.isTexture){let l=a.mapping,c=l===Wi||l===$r,h=l===bi||l===Si;if(c||h)if(a.isRenderTargetTexture&&a.needsPMREMUpdate===!0){a.needsPMREMUpdate=!1;let d=e.get(a);return t===null&&(t=new Xs(i)),d=c?t.fromEquirectangular(a,d):t.fromCubemap(a,d),e.set(a,d),d.texture}else{if(e.has(a))return e.get(a).texture;{let d=a.image;if(c&&d&&d.height>0||h&&d&&s(d)){t===null&&(t=new Xs(i));let f=c?t.fromEquirectangular(a):t.fromCubemap(a);return e.set(a,f),a.addEventListener("dispose",r),f.texture}else return null}}}return a}function s(a){let l=0,c=6;for(let h=0;h<c;h++)a[h]!==void 0&&l++;return l===c}function r(a){let l=a.target;l.removeEventListener("dispose",r);let c=e.get(l);c!==void 0&&(e.delete(l),c.dispose())}function o(){e=new WeakMap,t!==null&&(t.dispose(),t=null)}return{get:n,dispose:o}}function $d(i){let e={};function t(n){if(e[n]!==void 0)return e[n];let s;switch(n){case"WEBGL_depth_texture":s=i.getExtension("WEBGL_depth_texture")||i.getExtension("MOZ_WEBGL_depth_texture")||i.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":s=i.getExtension("EXT_texture_filter_anisotropic")||i.getExtension("MOZ_EXT_texture_filter_anisotropic")||i.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":s=i.getExtension("WEBGL_compressed_texture_s3tc")||i.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||i.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":s=i.getExtension("WEBGL_compressed_texture_pvrtc")||i.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:s=i.getExtension(n)}return e[n]=s,s}return{has:function(n){return t(n)!==null},init:function(n){n.isWebGL2?t("EXT_color_buffer_float"):(t("WEBGL_depth_texture"),t("OES_texture_float"),t("OES_texture_half_float"),t("OES_texture_half_float_linear"),t("OES_standard_derivatives"),t("OES_element_index_uint"),t("OES_vertex_array_object"),t("ANGLE_instanced_arrays")),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture")},get:function(n){let s=t(n);return s===null&&console.warn("THREE.WebGLRenderer: "+n+" extension not supported."),s}}}function Kd(i,e,t,n){let s={},r=new WeakMap;function o(d){let f=d.target;f.index!==null&&e.remove(f.index);for(let g in f.attributes)e.remove(f.attributes[g]);for(let g in f.morphAttributes){let _=f.morphAttributes[g];for(let p=0,u=_.length;p<u;p++)e.remove(_[p])}f.removeEventListener("dispose",o),delete s[f.id];let m=r.get(f);m&&(e.remove(m),r.delete(f)),n.releaseStatesOfGeometry(f),f.isInstancedBufferGeometry===!0&&delete f._maxInstanceCount,t.memory.geometries--}function a(d,f){return s[f.id]===!0||(f.addEventListener("dispose",o),s[f.id]=!0,t.memory.geometries++),f}function l(d){let f=d.attributes;for(let g in f)e.update(f[g],i.ARRAY_BUFFER);let m=d.morphAttributes;for(let g in m){let _=m[g];for(let p=0,u=_.length;p<u;p++)e.update(_[p],i.ARRAY_BUFFER)}}function c(d){let f=[],m=d.index,g=d.attributes.position,_=0;if(m!==null){let S=m.array;_=m.version;for(let y=0,R=S.length;y<R;y+=3){let w=S[y+0],P=S[y+1],T=S[y+2];f.push(w,P,P,T,T,w)}}else if(g!==void 0){let S=g.array;_=g.version;for(let y=0,R=S.length/3-1;y<R;y+=3){let w=y+0,P=y+1,T=y+2;f.push(w,P,P,T,T,w)}}else return;let p=new(G0(f)?Hs:Vs)(f,1);p.version=_;let u=r.get(d);u&&e.remove(u),r.set(d,p)}function h(d){let f=r.get(d);if(f){let m=d.index;m!==null&&f.version<m.version&&c(d)}else c(d);return r.get(d)}return{get:a,update:l,getWireframeAttribute:h}}function Qd(i,e,t,n){let s=n.isWebGL2,r;function o(f){r=f}let a,l;function c(f){a=f.type,l=f.bytesPerElement}function h(f,m){i.drawElements(r,m,a,f*l),t.update(m,r,1)}function d(f,m,g){if(g===0)return;let _,p;if(s)_=i,p="drawElementsInstanced";else if(_=e.get("ANGLE_instanced_arrays"),p="drawElementsInstancedANGLE",_===null){console.error("THREE.WebGLIndexedBufferRenderer: using THREE.InstancedBufferGeometry but hardware does not support extension ANGLE_instanced_arrays.");return}_[p](r,m,a,f*l,g),t.update(m,r,g)}this.setMode=o,this.setIndex=c,this.render=h,this.renderInstances=d}function ef(i){let e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,o,a){switch(t.calls++,o){case i.TRIANGLES:t.triangles+=a*(r/3);break;case i.LINES:t.lines+=a*(r/2);break;case i.LINE_STRIP:t.lines+=a*(r-1);break;case i.LINE_LOOP:t.lines+=a*r;break;case i.POINTS:t.points+=a*r;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",o);break}}function s(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:s,update:n}}function tf(i,e){return i[0]-e[0]}function nf(i,e){return Math.abs(e[1])-Math.abs(i[1])}function sf(i,e,t){let n={},s=new Float32Array(8),r=new WeakMap,o=new Ke,a=[];for(let c=0;c<8;c++)a[c]=[c,0];function l(c,h,d){let f=c.morphTargetInfluences;if(e.isWebGL2===!0){let m=h.morphAttributes.position||h.morphAttributes.normal||h.morphAttributes.color,g=m!==void 0?m.length:0,_=r.get(h);if(_===void 0||_.count!==g){let H=function(){te.dispose(),r.delete(h),h.removeEventListener("dispose",H)};_!==void 0&&_.texture.dispose();let S=h.morphAttributes.position!==void 0,y=h.morphAttributes.normal!==void 0,R=h.morphAttributes.color!==void 0,w=h.morphAttributes.position||[],P=h.morphAttributes.normal||[],T=h.morphAttributes.color||[],k=0;S===!0&&(k=1),y===!0&&(k=2),R===!0&&(k=3);let v=h.attributes.position.count*k,E=1;v>e.maxTextureSize&&(E=Math.ceil(v/e.maxTextureSize),v=e.maxTextureSize);let Z=new Float32Array(v*E*4*g),te=new Fs(Z,v,E,g);te.type=tn,te.needsUpdate=!0;let F=k*4;for(let V=0;V<g;V++){let K=w[V],X=P[V],q=T[V],J=v*E*4*V;for(let $=0;$<K.count;$++){let O=$*F;S===!0&&(o.fromBufferAttribute(K,$),Z[J+O+0]=o.x,Z[J+O+1]=o.y,Z[J+O+2]=o.z,Z[J+O+3]=0),y===!0&&(o.fromBufferAttribute(X,$),Z[J+O+4]=o.x,Z[J+O+5]=o.y,Z[J+O+6]=o.z,Z[J+O+7]=0),R===!0&&(o.fromBufferAttribute(q,$),Z[J+O+8]=o.x,Z[J+O+9]=o.y,Z[J+O+10]=o.z,Z[J+O+11]=q.itemSize===4?o.w:1)}}_={count:g,texture:te,size:new me(v,E)},r.set(h,_),h.addEventListener("dispose",H)}let p=0;for(let S=0;S<f.length;S++)p+=f[S];let u=h.morphTargetsRelative?1:1-p;d.getUniforms().setValue(i,"morphTargetBaseInfluence",u),d.getUniforms().setValue(i,"morphTargetInfluences",f),d.getUniforms().setValue(i,"morphTargetsTexture",_.texture,t),d.getUniforms().setValue(i,"morphTargetsTextureSize",_.size)}else{let m=f===void 0?0:f.length,g=n[h.id];if(g===void 0||g.length!==m){g=[];for(let y=0;y<m;y++)g[y]=[y,0];n[h.id]=g}for(let y=0;y<m;y++){let R=g[y];R[0]=y,R[1]=f[y]}g.sort(nf);for(let y=0;y<8;y++)y<m&&g[y][1]?(a[y][0]=g[y][0],a[y][1]=g[y][1]):(a[y][0]=Number.MAX_SAFE_INTEGER,a[y][1]=0);a.sort(tf);let _=h.morphAttributes.position,p=h.morphAttributes.normal,u=0;for(let y=0;y<8;y++){let R=a[y],w=R[0],P=R[1];w!==Number.MAX_SAFE_INTEGER&&P?(_&&h.getAttribute("morphTarget"+y)!==_[w]&&h.setAttribute("morphTarget"+y,_[w]),p&&h.getAttribute("morphNormal"+y)!==p[w]&&h.setAttribute("morphNormal"+y,p[w]),s[y]=P,u+=P):(_&&h.hasAttribute("morphTarget"+y)===!0&&h.deleteAttribute("morphTarget"+y),p&&h.hasAttribute("morphNormal"+y)===!0&&h.deleteAttribute("morphNormal"+y),s[y]=0)}let S=h.morphTargetsRelative?1:1-u;d.getUniforms().setValue(i,"morphTargetBaseInfluence",S),d.getUniforms().setValue(i,"morphTargetInfluences",s)}}return{update:l}}function rf(i,e,t,n){let s=new WeakMap;function r(l){let c=n.render.frame,h=l.geometry,d=e.get(l,h);if(s.get(d)!==c&&(e.update(d),s.set(d,c)),l.isInstancedMesh&&(l.hasEventListener("dispose",a)===!1&&l.addEventListener("dispose",a),s.get(l)!==c&&(t.update(l.instanceMatrix,i.ARRAY_BUFFER),l.instanceColor!==null&&t.update(l.instanceColor,i.ARRAY_BUFFER),s.set(l,c))),l.isSkinnedMesh){let f=l.skeleton;s.get(f)!==c&&(f.update(),s.set(f,c))}return d}function o(){s=new WeakMap}function a(l){let c=l.target;c.removeEventListener("dispose",a),t.remove(c.instanceMatrix),c.instanceColor!==null&&t.remove(c.instanceColor)}return{update:r,dispose:o}}var Y0=new ft,Z0=new Fs,j0=new sa,J0=new Ws,l0=[],c0=[],h0=new Float32Array(16),u0=new Float32Array(9),d0=new Float32Array(4);function Ri(i,e,t){let n=i[0];if(n<=0||n>0)return i;let s=e*t,r=l0[s];if(r===void 0&&(r=new Float32Array(s),l0[s]=r),e!==0){n.toArray(r,0);for(let o=1,a=0;o!==e;++o)a+=t,i[o].toArray(r,a)}return r}function ct(i,e){if(i.length!==e.length)return!1;for(let t=0,n=i.length;t<n;t++)if(i[t]!==e[t])return!1;return!0}function ht(i,e){for(let t=0,n=e.length;t<n;t++)i[t]=e[t]}function Qs(i,e){let t=c0[e];t===void 0&&(t=new Int32Array(e),c0[e]=t);for(let n=0;n!==e;++n)t[n]=i.allocateTextureUnit();return t}function af(i,e){let t=this.cache;t[0]!==e&&(i.uniform1f(this.addr,e),t[0]=e)}function of(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(ct(t,e))return;i.uniform2fv(this.addr,e),ht(t,e)}}function lf(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(i.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(ct(t,e))return;i.uniform3fv(this.addr,e),ht(t,e)}}function cf(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(ct(t,e))return;i.uniform4fv(this.addr,e),ht(t,e)}}function hf(i,e){let t=this.cache,n=e.elements;if(n===void 0){if(ct(t,e))return;i.uniformMatrix2fv(this.addr,!1,e),ht(t,e)}else{if(ct(t,n))return;d0.set(n),i.uniformMatrix2fv(this.addr,!1,d0),ht(t,n)}}function uf(i,e){let t=this.cache,n=e.elements;if(n===void 0){if(ct(t,e))return;i.uniformMatrix3fv(this.addr,!1,e),ht(t,e)}else{if(ct(t,n))return;u0.set(n),i.uniformMatrix3fv(this.addr,!1,u0),ht(t,n)}}function df(i,e){let t=this.cache,n=e.elements;if(n===void 0){if(ct(t,e))return;i.uniformMatrix4fv(this.addr,!1,e),ht(t,e)}else{if(ct(t,n))return;h0.set(n),i.uniformMatrix4fv(this.addr,!1,h0),ht(t,n)}}function ff(i,e){let t=this.cache;t[0]!==e&&(i.uniform1i(this.addr,e),t[0]=e)}function pf(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(ct(t,e))return;i.uniform2iv(this.addr,e),ht(t,e)}}function mf(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(ct(t,e))return;i.uniform3iv(this.addr,e),ht(t,e)}}function gf(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(ct(t,e))return;i.uniform4iv(this.addr,e),ht(t,e)}}function _f(i,e){let t=this.cache;t[0]!==e&&(i.uniform1ui(this.addr,e),t[0]=e)}function xf(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(ct(t,e))return;i.uniform2uiv(this.addr,e),ht(t,e)}}function yf(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(ct(t,e))return;i.uniform3uiv(this.addr,e),ht(t,e)}}function vf(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(ct(t,e))return;i.uniform4uiv(this.addr,e),ht(t,e)}}function Mf(i,e,t){let n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTexture2D(e||Y0,s)}function bf(i,e,t){let n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTexture3D(e||j0,s)}function Sf(i,e,t){let n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTextureCube(e||J0,s)}function wf(i,e,t){let n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTexture2DArray(e||Z0,s)}function Ef(i){switch(i){case 5126:return af;case 35664:return of;case 35665:return lf;case 35666:return cf;case 35674:return hf;case 35675:return uf;case 35676:return df;case 5124:case 35670:return ff;case 35667:case 35671:return pf;case 35668:case 35672:return mf;case 35669:case 35673:return gf;case 5125:return _f;case 36294:return xf;case 36295:return yf;case 36296:return vf;case 35678:case 36198:case 36298:case 36306:case 35682:return Mf;case 35679:case 36299:case 36307:return bf;case 35680:case 36300:case 36308:case 36293:return Sf;case 36289:case 36303:case 36311:case 36292:return wf}}function Tf(i,e){i.uniform1fv(this.addr,e)}function Af(i,e){let t=Ri(e,this.size,2);i.uniform2fv(this.addr,t)}function Rf(i,e){let t=Ri(e,this.size,3);i.uniform3fv(this.addr,t)}function Cf(i,e){let t=Ri(e,this.size,4);i.uniform4fv(this.addr,t)}function Pf(i,e){let t=Ri(e,this.size,4);i.uniformMatrix2fv(this.addr,!1,t)}function Lf(i,e){let t=Ri(e,this.size,9);i.uniformMatrix3fv(this.addr,!1,t)}function If(i,e){let t=Ri(e,this.size,16);i.uniformMatrix4fv(this.addr,!1,t)}function Df(i,e){i.uniform1iv(this.addr,e)}function Uf(i,e){i.uniform2iv(this.addr,e)}function Of(i,e){i.uniform3iv(this.addr,e)}function Nf(i,e){i.uniform4iv(this.addr,e)}function Ff(i,e){i.uniform1uiv(this.addr,e)}function zf(i,e){i.uniform2uiv(this.addr,e)}function Bf(i,e){i.uniform3uiv(this.addr,e)}function kf(i,e){i.uniform4uiv(this.addr,e)}function Vf(i,e,t){let n=this.cache,s=e.length,r=Qs(t,s);ct(n,r)||(i.uniform1iv(this.addr,r),ht(n,r));for(let o=0;o!==s;++o)t.setTexture2D(e[o]||Y0,r[o])}function Hf(i,e,t){let n=this.cache,s=e.length,r=Qs(t,s);ct(n,r)||(i.uniform1iv(this.addr,r),ht(n,r));for(let o=0;o!==s;++o)t.setTexture3D(e[o]||j0,r[o])}function Gf(i,e,t){let n=this.cache,s=e.length,r=Qs(t,s);ct(n,r)||(i.uniform1iv(this.addr,r),ht(n,r));for(let o=0;o!==s;++o)t.setTextureCube(e[o]||J0,r[o])}function Wf(i,e,t){let n=this.cache,s=e.length,r=Qs(t,s);ct(n,r)||(i.uniform1iv(this.addr,r),ht(n,r));for(let o=0;o!==s;++o)t.setTexture2DArray(e[o]||Z0,r[o])}function Xf(i){switch(i){case 5126:return Tf;case 35664:return Af;case 35665:return Rf;case 35666:return Cf;case 35674:return Pf;case 35675:return Lf;case 35676:return If;case 5124:case 35670:return Df;case 35667:case 35671:return Uf;case 35668:case 35672:return Of;case 35669:case 35673:return Nf;case 5125:return Ff;case 36294:return zf;case 36295:return Bf;case 36296:return kf;case 35678:case 36198:case 36298:case 36306:case 35682:return Vf;case 35679:case 36299:case 36307:return Hf;case 35680:case 36300:case 36308:case 36293:return Gf;case 36289:case 36303:case 36311:case 36292:return Wf}}var la=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.setValue=Ef(t.type)}},ca=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.size=t.size,this.setValue=Xf(t.type)}},ha=class{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){let s=this.seq;for(let r=0,o=s.length;r!==o;++r){let a=s[r];a.setValue(e,t[a.id],n)}}},qr=/(\w+)(\])?(\[|\.)?/g;function f0(i,e){i.seq.push(e),i.map[e.id]=e}function qf(i,e,t){let n=i.name,s=n.length;for(qr.lastIndex=0;;){let r=qr.exec(n),o=qr.lastIndex,a=r[1],l=r[2]==="]",c=r[3];if(l&&(a=a|0),c===void 0||c==="["&&o+2===s){f0(t,c===void 0?new la(a,i,e):new ca(a,i,e));break}else{let d=t.map[a];d===void 0&&(d=new ha(a),f0(t,d)),t=d}}}var Mi=class{constructor(e,t){this.seq=[],this.map={};let n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let s=0;s<n;++s){let r=e.getActiveUniform(t,s),o=e.getUniformLocation(t,r.name);qf(r,o,this)}}setValue(e,t,n,s){let r=this.map[t];r!==void 0&&r.setValue(e,n,s)}setOptional(e,t,n){let s=t[n];s!==void 0&&this.setValue(e,n,s)}static upload(e,t,n,s){for(let r=0,o=t.length;r!==o;++r){let a=t[r],l=n[a.id];l.needsUpdate!==!1&&a.setValue(e,l.value,s)}}static seqWithValue(e,t){let n=[];for(let s=0,r=e.length;s!==r;++s){let o=e[s];o.id in t&&n.push(o)}return n}};function p0(i,e,t){let n=i.createShader(e);return i.shaderSource(n,t),i.compileShader(n),n}var Yf=0;function Zf(i,e){let t=i.split(`
`),n=[],s=Math.max(e-6,0),r=Math.min(e+6,t.length);for(let o=s;o<r;o++){let a=o+1;n.push(`${a===e?">":" "} ${a}: ${t[o]}`)}return n.join(`
`)}function jf(i){switch(i){case sn:return["Linear","( value )"];case Xe:return["sRGB","( value )"];default:return console.warn("THREE.WebGLProgram: Unsupported color space:",i),["Linear","( value )"]}}function m0(i,e,t){let n=i.getShaderParameter(e,i.COMPILE_STATUS),s=i.getShaderInfoLog(e).trim();if(n&&s==="")return"";let r=/ERROR: 0:(\d+)/.exec(s);if(r){let o=parseInt(r[1]);return t.toUpperCase()+`

`+s+`

`+Zf(i.getShaderSource(e),o)}else return s}function Jf(i,e){let t=jf(e);return"vec4 "+i+"( vec4 value ) { return LinearTo"+t[0]+t[1]+"; }"}function $f(i,e){let t;switch(e){case Kl:t="Linear";break;case Ql:t="Reinhard";break;case ec:t="OptimizedCineon";break;case tc:t="ACESFilmic";break;case nc:t="Custom";break;default:console.warn("THREE.WebGLProgram: Unsupported toneMapping:",e),t="Linear"}return"vec3 "+i+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}function Kf(i){return[i.extensionDerivatives||i.envMapCubeUVHeight||i.bumpMap||i.normalMapTangentSpace||i.clearcoatNormalMap||i.flatShading||i.shaderID==="physical"?"#extension GL_OES_standard_derivatives : enable":"",(i.extensionFragDepth||i.logarithmicDepthBuffer)&&i.rendererExtensionFragDepth?"#extension GL_EXT_frag_depth : enable":"",i.extensionDrawBuffers&&i.rendererExtensionDrawBuffers?"#extension GL_EXT_draw_buffers : require":"",(i.extensionShaderTextureLOD||i.envMap||i.transmission)&&i.rendererExtensionShaderTextureLod?"#extension GL_EXT_shader_texture_lod : enable":""].filter(Bi).join(`
`)}function Qf(i){let e=[];for(let t in i){let n=i[t];n!==!1&&e.push("#define "+t+" "+n)}return e.join(`
`)}function ep(i,e){let t={},n=i.getProgramParameter(e,i.ACTIVE_ATTRIBUTES);for(let s=0;s<n;s++){let r=i.getActiveAttrib(e,s),o=r.name,a=1;r.type===i.FLOAT_MAT2&&(a=2),r.type===i.FLOAT_MAT3&&(a=3),r.type===i.FLOAT_MAT4&&(a=4),t[o]={type:r.type,location:i.getAttribLocation(e,o),locationSize:a}}return t}function Bi(i){return i!==""}function g0(i,e){let t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return i.replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function _0(i,e){return i.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}var tp=/^[ \t]*#include +<([\w\d./]+)>/gm;function ua(i){return i.replace(tp,ip)}var np=new Map([["encodings_fragment","colorspace_fragment"],["encodings_pars_fragment","colorspace_pars_fragment"],["output_fragment","opaque_fragment"]]);function ip(i,e){let t=Le[e];if(t===void 0){let n=np.get(e);if(n!==void 0)t=Le[n],console.warn('THREE.WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',e,n);else throw new Error("Can not resolve #include <"+e+">")}return ua(t)}var sp=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function x0(i){return i.replace(sp,rp)}function rp(i,e,t,n){let s="";for(let r=parseInt(e);r<parseInt(t);r++)s+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return s}function y0(i){let e="precision "+i.precision+` float;
precision `+i.precision+" int;";return i.precision==="highp"?e+=`
#define HIGH_PRECISION`:i.precision==="mediump"?e+=`
#define MEDIUM_PRECISION`:i.precision==="lowp"&&(e+=`
#define LOW_PRECISION`),e}function ap(i){let e="SHADOWMAP_TYPE_BASIC";return i.shadowMapType===C0?e="SHADOWMAP_TYPE_PCF":i.shadowMapType===Pl?e="SHADOWMAP_TYPE_PCF_SOFT":i.shadowMapType===mn&&(e="SHADOWMAP_TYPE_VSM"),e}function op(i){let e="ENVMAP_TYPE_CUBE";if(i.envMap)switch(i.envMapMode){case bi:case Si:e="ENVMAP_TYPE_CUBE";break;case $s:e="ENVMAP_TYPE_CUBE_UV";break}return e}function lp(i){let e="ENVMAP_MODE_REFLECTION";return i.envMap&&i.envMapMode===Si&&(e="ENVMAP_MODE_REFRACTION"),e}function cp(i){let e="ENVMAP_BLENDING_NONE";if(i.envMap)switch(i.combine){case I0:e="ENVMAP_BLENDING_MULTIPLY";break;case Jl:e="ENVMAP_BLENDING_MIX";break;case $l:e="ENVMAP_BLENDING_ADD";break}return e}function hp(i){let e=i.envMapCubeUVHeight;if(e===null)return null;let t=Math.log2(e)-2,n=1/e;return{texelWidth:1/(3*Math.max(Math.pow(2,t),112)),texelHeight:n,maxMip:t}}function up(i,e,t,n){let s=i.getContext(),r=t.defines,o=t.vertexShader,a=t.fragmentShader,l=ap(t),c=op(t),h=lp(t),d=cp(t),f=hp(t),m=t.isWebGL2?"":Kf(t),g=Qf(r),_=s.createProgram(),p,u,S=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(p=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g].filter(Bi).join(`
`),p.length>0&&(p+=`
`),u=[m,"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g].filter(Bi).join(`
`),u.length>0&&(u+=`
`)):(p=[y0(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g,t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+h:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors&&t.isWebGL2?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0&&t.isWebGL2?"#define MORPHTARGETS_TEXTURE":"",t.morphTargetsCount>0&&t.isWebGL2?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0&&t.isWebGL2?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.useLegacyLights?"#define LEGACY_LIGHTS":"",t.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",t.logarithmicDepthBuffer&&t.rendererExtensionFragDepth?"#define USE_LOGDEPTHBUF_EXT":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#if ( defined( USE_MORPHTARGETS ) && ! defined( MORPHTARGETS_TEXTURE ) )","	attribute vec3 morphTarget0;","	attribute vec3 morphTarget1;","	attribute vec3 morphTarget2;","	attribute vec3 morphTarget3;","	#ifdef USE_MORPHNORMALS","		attribute vec3 morphNormal0;","		attribute vec3 morphNormal1;","		attribute vec3 morphNormal2;","		attribute vec3 morphNormal3;","	#else","		attribute vec3 morphTarget4;","		attribute vec3 morphTarget5;","		attribute vec3 morphTarget6;","		attribute vec3 morphTarget7;","	#endif","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Bi).join(`
`),u=[m,y0(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+c:"",t.envMap?"#define "+h:"",t.envMap?"#define "+d:"",f?"#define CUBEUV_TEXEL_WIDTH "+f.texelWidth:"",f?"#define CUBEUV_TEXEL_HEIGHT "+f.texelHeight:"",f?"#define CUBEUV_MAX_MIP "+f.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.useLegacyLights?"#define LEGACY_LIGHTS":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",t.logarithmicDepthBuffer&&t.rendererExtensionFragDepth?"#define USE_LOGDEPTHBUF_EXT":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==Tn?"#define TONE_MAPPING":"",t.toneMapping!==Tn?Le.tonemapping_pars_fragment:"",t.toneMapping!==Tn?$f("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",Le.colorspace_pars_fragment,Jf("linearToOutputTexel",t.outputColorSpace),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(Bi).join(`
`)),o=ua(o),o=g0(o,t),o=_0(o,t),a=ua(a),a=g0(a,t),a=_0(a,t),o=x0(o),a=x0(a),t.isWebGL2&&t.isRawShaderMaterial!==!0&&(S=`#version 300 es
`,p=["precision mediump sampler2DArray;","#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+p,u=["#define varying in",t.glslVersion===ko?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===ko?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+u);let y=S+p+o,R=S+u+a,w=p0(s,s.VERTEX_SHADER,y),P=p0(s,s.FRAGMENT_SHADER,R);if(s.attachShader(_,w),s.attachShader(_,P),t.index0AttributeName!==void 0?s.bindAttribLocation(_,0,t.index0AttributeName):t.morphTargets===!0&&s.bindAttribLocation(_,0,"position"),s.linkProgram(_),i.debug.checkShaderErrors){let v=s.getProgramInfoLog(_).trim(),E=s.getShaderInfoLog(w).trim(),Z=s.getShaderInfoLog(P).trim(),te=!0,F=!0;if(s.getProgramParameter(_,s.LINK_STATUS)===!1)if(te=!1,typeof i.debug.onShaderError=="function")i.debug.onShaderError(s,_,w,P);else{let H=m0(s,w,"vertex"),V=m0(s,P,"fragment");console.error("THREE.WebGLProgram: Shader Error "+s.getError()+" - VALIDATE_STATUS "+s.getProgramParameter(_,s.VALIDATE_STATUS)+`

Program Info Log: `+v+`
`+H+`
`+V)}else v!==""?console.warn("THREE.WebGLProgram: Program Info Log:",v):(E===""||Z==="")&&(F=!1);F&&(this.diagnostics={runnable:te,programLog:v,vertexShader:{log:E,prefix:p},fragmentShader:{log:Z,prefix:u}})}s.deleteShader(w),s.deleteShader(P);let T;this.getUniforms=function(){return T===void 0&&(T=new Mi(s,_)),T};let k;return this.getAttributes=function(){return k===void 0&&(k=ep(s,_)),k},this.destroy=function(){n.releaseStatesOfProgram(this),s.deleteProgram(_),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=Yf++,this.cacheKey=e,this.usedTimes=1,this.program=_,this.vertexShader=w,this.fragmentShader=P,this}var dp=0,da=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e){let t=e.vertexShader,n=e.fragmentShader,s=this._getShaderStage(t),r=this._getShaderStage(n),o=this._getShaderCacheForMaterial(e);return o.has(s)===!1&&(o.add(s),s.usedTimes++),o.has(r)===!1&&(o.add(r),r.usedTimes++),this}remove(e){let t=this.materialCache.get(e);for(let n of t)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(e),this}getVertexShaderID(e){return this._getShaderStage(e.vertexShader).id}getFragmentShaderID(e){return this._getShaderStage(e.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){let t=this.shaderCache,n=t.get(e);return n===void 0&&(n=new fa(e),t.set(e,n)),n}},fa=class{constructor(e){this.id=dp++,this.code=e,this.usedTimes=0}};function fp(i,e,t,n,s,r,o){let a=new Bs,l=new da,c=[],h=s.isWebGL2,d=s.logarithmicDepthBuffer,f=s.vertexTextures,m=s.precision,g={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function _(v){return v===0?"uv":`uv${v}`}function p(v,E,Z,te,F){let H=te.fog,V=F.geometry,K=v.isMeshStandardMaterial?te.environment:null,X=(v.isMeshStandardMaterial?t:e).get(v.envMap||K),q=X&&X.mapping===$s?X.image.height:null,J=g[v.type];v.precision!==null&&(m=s.getMaxPrecision(v.precision),m!==v.precision&&console.warn("THREE.WebGLProgram.getParameters:",v.precision,"not supported, using",m,"instead."));let $=V.morphAttributes.position||V.morphAttributes.normal||V.morphAttributes.color,O=$!==void 0?$.length:0,Y=0;V.morphAttributes.position!==void 0&&(Y=1),V.morphAttributes.normal!==void 0&&(Y=2),V.morphAttributes.color!==void 0&&(Y=3);let ue,de,fe,ve;if(J){let je=Qt[J];ue=je.vertexShader,de=je.fragmentShader}else ue=v.vertexShader,de=v.fragmentShader,l.update(v),fe=l.getVertexShaderID(v),ve=l.getFragmentShaderID(v);let Ee=i.getRenderTarget(),_e=F.isInstancedMesh===!0,ke=!!v.map,pt=!!v.matcap,Ce=!!X,D=!!v.aoMap,at=!!v.lightMap,xe=!!v.bumpMap,Ae=!!v.normalMap,be=!!v.displacementMap,Ze=!!v.emissiveMap,Ie=!!v.metalnessMap,Re=!!v.roughnessMap,Ve=v.anisotropy>0,ot=v.clearcoat>0,ut=v.iridescence>0,b=v.sheen>0,x=v.transmission>0,N=Ve&&!!v.anisotropyMap,ne=ot&&!!v.clearcoatMap,Q=ot&&!!v.clearcoatNormalMap,ie=ot&&!!v.clearcoatRoughnessMap,ge=ut&&!!v.iridescenceMap,se=ut&&!!v.iridescenceThicknessMap,z=b&&!!v.sheenColorMap,A=b&&!!v.sheenRoughnessMap,j=!!v.specularMap,he=!!v.specularColorMap,ae=!!v.specularIntensityMap,ce=x&&!!v.transmissionMap,Te=x&&!!v.thicknessMap,Be=!!v.gradientMap,C=!!v.alphaMap,le=v.alphaTest>0,B=!!v.alphaHash,ee=!!v.extensions,re=!!V.attributes.uv1,Oe=!!V.attributes.uv2,We=!!V.attributes.uv3,Ye=Tn;return v.toneMapped&&(Ee===null||Ee.isXRRenderTarget===!0)&&(Ye=i.toneMapping),{isWebGL2:h,shaderID:J,shaderType:v.type,shaderName:v.name,vertexShader:ue,fragmentShader:de,defines:v.defines,customVertexShaderID:fe,customFragmentShaderID:ve,isRawShaderMaterial:v.isRawShaderMaterial===!0,glslVersion:v.glslVersion,precision:m,instancing:_e,instancingColor:_e&&F.instanceColor!==null,supportsVertexTextures:f,outputColorSpace:Ee===null?i.outputColorSpace:Ee.isXRRenderTarget===!0?Ee.texture.colorSpace:sn,map:ke,matcap:pt,envMap:Ce,envMapMode:Ce&&X.mapping,envMapCubeUVHeight:q,aoMap:D,lightMap:at,bumpMap:xe,normalMap:Ae,displacementMap:f&&be,emissiveMap:Ze,normalMapObjectSpace:Ae&&v.normalMapType===mc,normalMapTangentSpace:Ae&&v.normalMapType===V0,metalnessMap:Ie,roughnessMap:Re,anisotropy:Ve,anisotropyMap:N,clearcoat:ot,clearcoatMap:ne,clearcoatNormalMap:Q,clearcoatRoughnessMap:ie,iridescence:ut,iridescenceMap:ge,iridescenceThicknessMap:se,sheen:b,sheenColorMap:z,sheenRoughnessMap:A,specularMap:j,specularColorMap:he,specularIntensityMap:ae,transmission:x,transmissionMap:ce,thicknessMap:Te,gradientMap:Be,opaque:v.transparent===!1&&v.blending===yi,alphaMap:C,alphaTest:le,alphaHash:B,combine:v.combine,mapUv:ke&&_(v.map.channel),aoMapUv:D&&_(v.aoMap.channel),lightMapUv:at&&_(v.lightMap.channel),bumpMapUv:xe&&_(v.bumpMap.channel),normalMapUv:Ae&&_(v.normalMap.channel),displacementMapUv:be&&_(v.displacementMap.channel),emissiveMapUv:Ze&&_(v.emissiveMap.channel),metalnessMapUv:Ie&&_(v.metalnessMap.channel),roughnessMapUv:Re&&_(v.roughnessMap.channel),anisotropyMapUv:N&&_(v.anisotropyMap.channel),clearcoatMapUv:ne&&_(v.clearcoatMap.channel),clearcoatNormalMapUv:Q&&_(v.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:ie&&_(v.clearcoatRoughnessMap.channel),iridescenceMapUv:ge&&_(v.iridescenceMap.channel),iridescenceThicknessMapUv:se&&_(v.iridescenceThicknessMap.channel),sheenColorMapUv:z&&_(v.sheenColorMap.channel),sheenRoughnessMapUv:A&&_(v.sheenRoughnessMap.channel),specularMapUv:j&&_(v.specularMap.channel),specularColorMapUv:he&&_(v.specularColorMap.channel),specularIntensityMapUv:ae&&_(v.specularIntensityMap.channel),transmissionMapUv:ce&&_(v.transmissionMap.channel),thicknessMapUv:Te&&_(v.thicknessMap.channel),alphaMapUv:C&&_(v.alphaMap.channel),vertexTangents:!!V.attributes.tangent&&(Ae||Ve),vertexColors:v.vertexColors,vertexAlphas:v.vertexColors===!0&&!!V.attributes.color&&V.attributes.color.itemSize===4,vertexUv1s:re,vertexUv2s:Oe,vertexUv3s:We,pointsUvs:F.isPoints===!0&&!!V.attributes.uv&&(ke||C),fog:!!H,useFog:v.fog===!0,fogExp2:H&&H.isFogExp2,flatShading:v.flatShading===!0,sizeAttenuation:v.sizeAttenuation===!0,logarithmicDepthBuffer:d,skinning:F.isSkinnedMesh===!0,morphTargets:V.morphAttributes.position!==void 0,morphNormals:V.morphAttributes.normal!==void 0,morphColors:V.morphAttributes.color!==void 0,morphTargetsCount:O,morphTextureStride:Y,numDirLights:E.directional.length,numPointLights:E.point.length,numSpotLights:E.spot.length,numSpotLightMaps:E.spotLightMap.length,numRectAreaLights:E.rectArea.length,numHemiLights:E.hemi.length,numDirLightShadows:E.directionalShadowMap.length,numPointLightShadows:E.pointShadowMap.length,numSpotLightShadows:E.spotShadowMap.length,numSpotLightShadowsWithMaps:E.numSpotLightShadowsWithMaps,numClippingPlanes:o.numPlanes,numClipIntersection:o.numIntersection,dithering:v.dithering,shadowMapEnabled:i.shadowMap.enabled&&Z.length>0,shadowMapType:i.shadowMap.type,toneMapping:Ye,useLegacyLights:i._useLegacyLights,decodeVideoTexture:ke&&v.map.isVideoTexture===!0&&v.map.colorSpace===Xe,premultipliedAlpha:v.premultipliedAlpha,doubleSided:v.side===vt,flipSided:v.side===Tt,useDepthPacking:v.depthPacking>=0,depthPacking:v.depthPacking||0,index0AttributeName:v.index0AttributeName,extensionDerivatives:ee&&v.extensions.derivatives===!0,extensionFragDepth:ee&&v.extensions.fragDepth===!0,extensionDrawBuffers:ee&&v.extensions.drawBuffers===!0,extensionShaderTextureLOD:ee&&v.extensions.shaderTextureLOD===!0,rendererExtensionFragDepth:h||n.has("EXT_frag_depth"),rendererExtensionDrawBuffers:h||n.has("WEBGL_draw_buffers"),rendererExtensionShaderTextureLod:h||n.has("EXT_shader_texture_lod"),customProgramCacheKey:v.customProgramCacheKey()}}function u(v){let E=[];if(v.shaderID?E.push(v.shaderID):(E.push(v.customVertexShaderID),E.push(v.customFragmentShaderID)),v.defines!==void 0)for(let Z in v.defines)E.push(Z),E.push(v.defines[Z]);return v.isRawShaderMaterial===!1&&(S(E,v),y(E,v),E.push(i.outputColorSpace)),E.push(v.customProgramCacheKey),E.join()}function S(v,E){v.push(E.precision),v.push(E.outputColorSpace),v.push(E.envMapMode),v.push(E.envMapCubeUVHeight),v.push(E.mapUv),v.push(E.alphaMapUv),v.push(E.lightMapUv),v.push(E.aoMapUv),v.push(E.bumpMapUv),v.push(E.normalMapUv),v.push(E.displacementMapUv),v.push(E.emissiveMapUv),v.push(E.metalnessMapUv),v.push(E.roughnessMapUv),v.push(E.anisotropyMapUv),v.push(E.clearcoatMapUv),v.push(E.clearcoatNormalMapUv),v.push(E.clearcoatRoughnessMapUv),v.push(E.iridescenceMapUv),v.push(E.iridescenceThicknessMapUv),v.push(E.sheenColorMapUv),v.push(E.sheenRoughnessMapUv),v.push(E.specularMapUv),v.push(E.specularColorMapUv),v.push(E.specularIntensityMapUv),v.push(E.transmissionMapUv),v.push(E.thicknessMapUv),v.push(E.combine),v.push(E.fogExp2),v.push(E.sizeAttenuation),v.push(E.morphTargetsCount),v.push(E.morphAttributeCount),v.push(E.numDirLights),v.push(E.numPointLights),v.push(E.numSpotLights),v.push(E.numSpotLightMaps),v.push(E.numHemiLights),v.push(E.numRectAreaLights),v.push(E.numDirLightShadows),v.push(E.numPointLightShadows),v.push(E.numSpotLightShadows),v.push(E.numSpotLightShadowsWithMaps),v.push(E.shadowMapType),v.push(E.toneMapping),v.push(E.numClippingPlanes),v.push(E.numClipIntersection),v.push(E.depthPacking)}function y(v,E){a.disableAll(),E.isWebGL2&&a.enable(0),E.supportsVertexTextures&&a.enable(1),E.instancing&&a.enable(2),E.instancingColor&&a.enable(3),E.matcap&&a.enable(4),E.envMap&&a.enable(5),E.normalMapObjectSpace&&a.enable(6),E.normalMapTangentSpace&&a.enable(7),E.clearcoat&&a.enable(8),E.iridescence&&a.enable(9),E.alphaTest&&a.enable(10),E.vertexColors&&a.enable(11),E.vertexAlphas&&a.enable(12),E.vertexUv1s&&a.enable(13),E.vertexUv2s&&a.enable(14),E.vertexUv3s&&a.enable(15),E.vertexTangents&&a.enable(16),E.anisotropy&&a.enable(17),v.push(a.mask),a.disableAll(),E.fog&&a.enable(0),E.useFog&&a.enable(1),E.flatShading&&a.enable(2),E.logarithmicDepthBuffer&&a.enable(3),E.skinning&&a.enable(4),E.morphTargets&&a.enable(5),E.morphNormals&&a.enable(6),E.morphColors&&a.enable(7),E.premultipliedAlpha&&a.enable(8),E.shadowMapEnabled&&a.enable(9),E.useLegacyLights&&a.enable(10),E.doubleSided&&a.enable(11),E.flipSided&&a.enable(12),E.useDepthPacking&&a.enable(13),E.dithering&&a.enable(14),E.transmission&&a.enable(15),E.sheen&&a.enable(16),E.opaque&&a.enable(17),E.pointsUvs&&a.enable(18),E.decodeVideoTexture&&a.enable(19),v.push(a.mask)}function R(v){let E=g[v.type],Z;if(E){let te=Qt[E];Z=Ua.clone(te.uniforms)}else Z=v.uniforms;return Z}function w(v,E){let Z;for(let te=0,F=c.length;te<F;te++){let H=c[te];if(H.cacheKey===E){Z=H,++Z.usedTimes;break}}return Z===void 0&&(Z=new up(i,E,v,r),c.push(Z)),Z}function P(v){if(--v.usedTimes===0){let E=c.indexOf(v);c[E]=c[c.length-1],c.pop(),v.destroy()}}function T(v){l.remove(v)}function k(){l.dispose()}return{getParameters:p,getProgramCacheKey:u,getUniforms:R,acquireProgram:w,releaseProgram:P,releaseShaderCache:T,programs:c,dispose:k}}function pp(){let i=new WeakMap;function e(r){let o=i.get(r);return o===void 0&&(o={},i.set(r,o)),o}function t(r){i.delete(r)}function n(r,o,a){i.get(r)[o]=a}function s(){i=new WeakMap}return{get:e,remove:t,update:n,dispose:s}}function mp(i,e){return i.groupOrder!==e.groupOrder?i.groupOrder-e.groupOrder:i.renderOrder!==e.renderOrder?i.renderOrder-e.renderOrder:i.material.id!==e.material.id?i.material.id-e.material.id:i.z!==e.z?i.z-e.z:i.id-e.id}function v0(i,e){return i.groupOrder!==e.groupOrder?i.groupOrder-e.groupOrder:i.renderOrder!==e.renderOrder?i.renderOrder-e.renderOrder:i.z!==e.z?e.z-i.z:i.id-e.id}function M0(){let i=[],e=0,t=[],n=[],s=[];function r(){e=0,t.length=0,n.length=0,s.length=0}function o(d,f,m,g,_,p){let u=i[e];return u===void 0?(u={id:d.id,object:d,geometry:f,material:m,groupOrder:g,renderOrder:d.renderOrder,z:_,group:p},i[e]=u):(u.id=d.id,u.object=d,u.geometry=f,u.material=m,u.groupOrder=g,u.renderOrder=d.renderOrder,u.z=_,u.group=p),e++,u}function a(d,f,m,g,_,p){let u=o(d,f,m,g,_,p);m.transmission>0?n.push(u):m.transparent===!0?s.push(u):t.push(u)}function l(d,f,m,g,_,p){let u=o(d,f,m,g,_,p);m.transmission>0?n.unshift(u):m.transparent===!0?s.unshift(u):t.unshift(u)}function c(d,f){t.length>1&&t.sort(d||mp),n.length>1&&n.sort(f||v0),s.length>1&&s.sort(f||v0)}function h(){for(let d=e,f=i.length;d<f;d++){let m=i[d];if(m.id===null)break;m.id=null,m.object=null,m.geometry=null,m.material=null,m.group=null}}return{opaque:t,transmissive:n,transparent:s,init:r,push:a,unshift:l,finish:h,sort:c}}function gp(){let i=new WeakMap;function e(n,s){let r=i.get(n),o;return r===void 0?(o=new M0,i.set(n,[o])):s>=r.length?(o=new M0,r.push(o)):o=r[s],o}function t(){i=new WeakMap}return{get:e,dispose:t}}function _p(){let i={};return{get:function(e){if(i[e.id]!==void 0)return i[e.id];let t;switch(e.type){case"DirectionalLight":t={direction:new L,color:new ze};break;case"SpotLight":t={position:new L,direction:new L,color:new ze,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new L,color:new ze,distance:0,decay:0};break;case"HemisphereLight":t={direction:new L,skyColor:new ze,groundColor:new ze};break;case"RectAreaLight":t={color:new ze,position:new L,halfWidth:new L,halfHeight:new L};break}return i[e.id]=t,t}}}function xp(){let i={};return{get:function(e){if(i[e.id]!==void 0)return i[e.id];let t;switch(e.type){case"DirectionalLight":t={shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new me};break;case"SpotLight":t={shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new me};break;case"PointLight":t={shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new me,shadowCameraNear:1,shadowCameraFar:1e3};break}return i[e.id]=t,t}}}var yp=0;function vp(i,e){return(e.castShadow?2:0)-(i.castShadow?2:0)+(e.map?1:0)-(i.map?1:0)}function Mp(i,e){let t=new _p,n=xp(),s={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0};for(let h=0;h<9;h++)s.probe.push(new L);let r=new L,o=new rt,a=new rt;function l(h,d){let f=0,m=0,g=0;for(let Z=0;Z<9;Z++)s.probe[Z].set(0,0,0);let _=0,p=0,u=0,S=0,y=0,R=0,w=0,P=0,T=0,k=0;h.sort(vp);let v=d===!0?Math.PI:1;for(let Z=0,te=h.length;Z<te;Z++){let F=h[Z],H=F.color,V=F.intensity,K=F.distance,X=F.shadow&&F.shadow.map?F.shadow.map.texture:null;if(F.isAmbientLight)f+=H.r*V*v,m+=H.g*V*v,g+=H.b*V*v;else if(F.isLightProbe)for(let q=0;q<9;q++)s.probe[q].addScaledVector(F.sh.coefficients[q],V);else if(F.isDirectionalLight){let q=t.get(F);if(q.color.copy(F.color).multiplyScalar(F.intensity*v),F.castShadow){let J=F.shadow,$=n.get(F);$.shadowBias=J.bias,$.shadowNormalBias=J.normalBias,$.shadowRadius=J.radius,$.shadowMapSize=J.mapSize,s.directionalShadow[_]=$,s.directionalShadowMap[_]=X,s.directionalShadowMatrix[_]=F.shadow.matrix,R++}s.directional[_]=q,_++}else if(F.isSpotLight){let q=t.get(F);q.position.setFromMatrixPosition(F.matrixWorld),q.color.copy(H).multiplyScalar(V*v),q.distance=K,q.coneCos=Math.cos(F.angle),q.penumbraCos=Math.cos(F.angle*(1-F.penumbra)),q.decay=F.decay,s.spot[u]=q;let J=F.shadow;if(F.map&&(s.spotLightMap[T]=F.map,T++,J.updateMatrices(F),F.castShadow&&k++),s.spotLightMatrix[u]=J.matrix,F.castShadow){let $=n.get(F);$.shadowBias=J.bias,$.shadowNormalBias=J.normalBias,$.shadowRadius=J.radius,$.shadowMapSize=J.mapSize,s.spotShadow[u]=$,s.spotShadowMap[u]=X,P++}u++}else if(F.isRectAreaLight){let q=t.get(F);q.color.copy(H).multiplyScalar(V),q.halfWidth.set(F.width*.5,0,0),q.halfHeight.set(0,F.height*.5,0),s.rectArea[S]=q,S++}else if(F.isPointLight){let q=t.get(F);if(q.color.copy(F.color).multiplyScalar(F.intensity*v),q.distance=F.distance,q.decay=F.decay,F.castShadow){let J=F.shadow,$=n.get(F);$.shadowBias=J.bias,$.shadowNormalBias=J.normalBias,$.shadowRadius=J.radius,$.shadowMapSize=J.mapSize,$.shadowCameraNear=J.camera.near,$.shadowCameraFar=J.camera.far,s.pointShadow[p]=$,s.pointShadowMap[p]=X,s.pointShadowMatrix[p]=F.shadow.matrix,w++}s.point[p]=q,p++}else if(F.isHemisphereLight){let q=t.get(F);q.skyColor.copy(F.color).multiplyScalar(V*v),q.groundColor.copy(F.groundColor).multiplyScalar(V*v),s.hemi[y]=q,y++}}S>0&&(e.isWebGL2||i.has("OES_texture_float_linear")===!0?(s.rectAreaLTC1=oe.LTC_FLOAT_1,s.rectAreaLTC2=oe.LTC_FLOAT_2):i.has("OES_texture_half_float_linear")===!0?(s.rectAreaLTC1=oe.LTC_HALF_1,s.rectAreaLTC2=oe.LTC_HALF_2):console.error("THREE.WebGLRenderer: Unable to use RectAreaLight. Missing WebGL extensions.")),s.ambient[0]=f,s.ambient[1]=m,s.ambient[2]=g;let E=s.hash;(E.directionalLength!==_||E.pointLength!==p||E.spotLength!==u||E.rectAreaLength!==S||E.hemiLength!==y||E.numDirectionalShadows!==R||E.numPointShadows!==w||E.numSpotShadows!==P||E.numSpotMaps!==T)&&(s.directional.length=_,s.spot.length=u,s.rectArea.length=S,s.point.length=p,s.hemi.length=y,s.directionalShadow.length=R,s.directionalShadowMap.length=R,s.pointShadow.length=w,s.pointShadowMap.length=w,s.spotShadow.length=P,s.spotShadowMap.length=P,s.directionalShadowMatrix.length=R,s.pointShadowMatrix.length=w,s.spotLightMatrix.length=P+T-k,s.spotLightMap.length=T,s.numSpotLightShadowsWithMaps=k,E.directionalLength=_,E.pointLength=p,E.spotLength=u,E.rectAreaLength=S,E.hemiLength=y,E.numDirectionalShadows=R,E.numPointShadows=w,E.numSpotShadows=P,E.numSpotMaps=T,s.version=yp++)}function c(h,d){let f=0,m=0,g=0,_=0,p=0,u=d.matrixWorldInverse;for(let S=0,y=h.length;S<y;S++){let R=h[S];if(R.isDirectionalLight){let w=s.directional[f];w.direction.setFromMatrixPosition(R.matrixWorld),r.setFromMatrixPosition(R.target.matrixWorld),w.direction.sub(r),w.direction.transformDirection(u),f++}else if(R.isSpotLight){let w=s.spot[g];w.position.setFromMatrixPosition(R.matrixWorld),w.position.applyMatrix4(u),w.direction.setFromMatrixPosition(R.matrixWorld),r.setFromMatrixPosition(R.target.matrixWorld),w.direction.sub(r),w.direction.transformDirection(u),g++}else if(R.isRectAreaLight){let w=s.rectArea[_];w.position.setFromMatrixPosition(R.matrixWorld),w.position.applyMatrix4(u),a.identity(),o.copy(R.matrixWorld),o.premultiply(u),a.extractRotation(o),w.halfWidth.set(R.width*.5,0,0),w.halfHeight.set(0,R.height*.5,0),w.halfWidth.applyMatrix4(a),w.halfHeight.applyMatrix4(a),_++}else if(R.isPointLight){let w=s.point[m];w.position.setFromMatrixPosition(R.matrixWorld),w.position.applyMatrix4(u),m++}else if(R.isHemisphereLight){let w=s.hemi[p];w.direction.setFromMatrixPosition(R.matrixWorld),w.direction.transformDirection(u),p++}}}return{setup:l,setupView:c,state:s}}function b0(i,e){let t=new Mp(i,e),n=[],s=[];function r(){n.length=0,s.length=0}function o(d){n.push(d)}function a(d){s.push(d)}function l(d){t.setup(n,d)}function c(d){t.setupView(n,d)}return{init:r,state:{lightsArray:n,shadowsArray:s,lights:t},setupLights:l,setupLightsView:c,pushLight:o,pushShadow:a}}function bp(i,e){let t=new WeakMap;function n(r,o=0){let a=t.get(r),l;return a===void 0?(l=new b0(i,e),t.set(r,[l])):o>=a.length?(l=new b0(i,e),a.push(l)):l=a[o],l}function s(){t=new WeakMap}return{get:n,dispose:s}}var pa=class extends Rn{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=fc,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}},ma=class extends Rn{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}},Sp=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,wp=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}`;function Ep(i,e,t){let n=new ji,s=new me,r=new me,o=new Ke,a=new pa({depthPacking:pc}),l=new ma,c={},h=t.maxTextureSize,d={[Dt]:Tt,[Tt]:Dt,[vt]:vt},f=new Bt({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new me},radius:{value:4}},vertexShader:Sp,fragmentShader:wp}),m=f.clone();m.defines.HORIZONTAL_PASS=1;let g=new Ot;g.setAttribute("position",new It(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let _=new Ge(g,f),p=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=C0;let u=this.type;this.render=function(w,P,T){if(p.enabled===!1||p.autoUpdate===!1&&p.needsUpdate===!1||w.length===0)return;let k=i.getRenderTarget(),v=i.getActiveCubeFace(),E=i.getActiveMipmapLevel(),Z=i.state;Z.setBlending(nn),Z.buffers.color.setClear(1,1,1,1),Z.buffers.depth.setTest(!0),Z.setScissorTest(!1);let te=u!==mn&&this.type===mn,F=u===mn&&this.type!==mn;for(let H=0,V=w.length;H<V;H++){let K=w[H],X=K.shadow;if(X===void 0){console.warn("THREE.WebGLShadowMap:",K,"has no shadow.");continue}if(X.autoUpdate===!1&&X.needsUpdate===!1)continue;s.copy(X.mapSize);let q=X.getFrameExtents();if(s.multiply(q),r.copy(X.mapSize),(s.x>h||s.y>h)&&(s.x>h&&(r.x=Math.floor(h/q.x),s.x=r.x*q.x,X.mapSize.x=r.x),s.y>h&&(r.y=Math.floor(h/q.y),s.y=r.y*q.y,X.mapSize.y=r.y)),X.map===null||te===!0||F===!0){let $=this.type!==mn?{minFilter:He,magFilter:He}:{};X.map!==null&&X.map.dispose(),X.map=new Ut(s.x,s.y,$),X.map.texture.name=K.name+".shadowMap",X.camera.updateProjectionMatrix()}i.setRenderTarget(X.map),i.clear();let J=X.getViewportCount();for(let $=0;$<J;$++){let O=X.getViewport($);o.set(r.x*O.x,r.y*O.y,r.x*O.z,r.y*O.w),Z.viewport(o),X.updateMatrices(K,$),n=X.getFrustum(),R(P,T,X.camera,K,this.type)}X.isPointLightShadow!==!0&&this.type===mn&&S(X,T),X.needsUpdate=!1}u=this.type,p.needsUpdate=!1,i.setRenderTarget(k,v,E)};function S(w,P){let T=e.update(_);f.defines.VSM_SAMPLES!==w.blurSamples&&(f.defines.VSM_SAMPLES=w.blurSamples,m.defines.VSM_SAMPLES=w.blurSamples,f.needsUpdate=!0,m.needsUpdate=!0),w.mapPass===null&&(w.mapPass=new Ut(s.x,s.y)),f.uniforms.shadow_pass.value=w.map.texture,f.uniforms.resolution.value=w.mapSize,f.uniforms.radius.value=w.radius,i.setRenderTarget(w.mapPass),i.clear(),i.renderBufferDirect(P,null,T,f,_,null),m.uniforms.shadow_pass.value=w.mapPass.texture,m.uniforms.resolution.value=w.mapSize,m.uniforms.radius.value=w.radius,i.setRenderTarget(w.map),i.clear(),i.renderBufferDirect(P,null,T,m,_,null)}function y(w,P,T,k){let v=null,E=T.isPointLight===!0?w.customDistanceMaterial:w.customDepthMaterial;if(E!==void 0)v=E;else if(v=T.isPointLight===!0?l:a,i.localClippingEnabled&&P.clipShadows===!0&&Array.isArray(P.clippingPlanes)&&P.clippingPlanes.length!==0||P.displacementMap&&P.displacementScale!==0||P.alphaMap&&P.alphaTest>0||P.map&&P.alphaTest>0){let Z=v.uuid,te=P.uuid,F=c[Z];F===void 0&&(F={},c[Z]=F);let H=F[te];H===void 0&&(H=v.clone(),F[te]=H),v=H}if(v.visible=P.visible,v.wireframe=P.wireframe,k===mn?v.side=P.shadowSide!==null?P.shadowSide:P.side:v.side=P.shadowSide!==null?P.shadowSide:d[P.side],v.alphaMap=P.alphaMap,v.alphaTest=P.alphaTest,v.map=P.map,v.clipShadows=P.clipShadows,v.clippingPlanes=P.clippingPlanes,v.clipIntersection=P.clipIntersection,v.displacementMap=P.displacementMap,v.displacementScale=P.displacementScale,v.displacementBias=P.displacementBias,v.wireframeLinewidth=P.wireframeLinewidth,v.linewidth=P.linewidth,T.isPointLight===!0&&v.isMeshDistanceMaterial===!0){let Z=i.properties.get(v);Z.light=T}return v}function R(w,P,T,k,v){if(w.visible===!1)return;if(w.layers.test(P.layers)&&(w.isMesh||w.isLine||w.isPoints)&&(w.castShadow||w.receiveShadow&&v===mn)&&(!w.frustumCulled||n.intersectsObject(w))){w.modelViewMatrix.multiplyMatrices(T.matrixWorldInverse,w.matrixWorld);let te=e.update(w),F=w.material;if(Array.isArray(F)){let H=te.groups;for(let V=0,K=H.length;V<K;V++){let X=H[V],q=F[X.materialIndex];if(q&&q.visible){let J=y(w,q,k,v);i.renderBufferDirect(T,null,te,J,w,X)}}}else if(F.visible){let H=y(w,F,k,v);i.renderBufferDirect(T,null,te,H,w,null)}}let Z=w.children;for(let te=0,F=Z.length;te<F;te++)R(Z[te],P,T,k,v)}}function Tp(i,e,t){let n=t.isWebGL2;function s(){let C=!1,le=new Ke,B=null,ee=new Ke(0,0,0,0);return{setMask:function(re){B!==re&&!C&&(i.colorMask(re,re,re,re),B=re)},setLocked:function(re){C=re},setClear:function(re,Oe,We,Ye,At){At===!0&&(re*=Ye,Oe*=Ye,We*=Ye),le.set(re,Oe,We,Ye),ee.equals(le)===!1&&(i.clearColor(re,Oe,We,Ye),ee.copy(le))},reset:function(){C=!1,B=null,ee.set(-1,0,0,0)}}}function r(){let C=!1,le=null,B=null,ee=null;return{setTest:function(re){re?Ee(i.DEPTH_TEST):_e(i.DEPTH_TEST)},setMask:function(re){le!==re&&!C&&(i.depthMask(re),le=re)},setFunc:function(re){if(B!==re){switch(re){case Gl:i.depthFunc(i.NEVER);break;case Wl:i.depthFunc(i.ALWAYS);break;case Xl:i.depthFunc(i.LESS);break;case Jr:i.depthFunc(i.LEQUAL);break;case ql:i.depthFunc(i.EQUAL);break;case Yl:i.depthFunc(i.GEQUAL);break;case Zl:i.depthFunc(i.GREATER);break;case jl:i.depthFunc(i.NOTEQUAL);break;default:i.depthFunc(i.LEQUAL)}B=re}},setLocked:function(re){C=re},setClear:function(re){ee!==re&&(i.clearDepth(re),ee=re)},reset:function(){C=!1,le=null,B=null,ee=null}}}function o(){let C=!1,le=null,B=null,ee=null,re=null,Oe=null,We=null,Ye=null,At=null;return{setTest:function(je){C||(je?Ee(i.STENCIL_TEST):_e(i.STENCIL_TEST))},setMask:function(je){le!==je&&!C&&(i.stencilMask(je),le=je)},setFunc:function(je,Kt,Mt){(B!==je||ee!==Kt||re!==Mt)&&(i.stencilFunc(je,Kt,Mt),B=je,ee=Kt,re=Mt)},setOp:function(je,Kt,Mt){(Oe!==je||We!==Kt||Ye!==Mt)&&(i.stencilOp(je,Kt,Mt),Oe=je,We=Kt,Ye=Mt)},setLocked:function(je){C=je},setClear:function(je){At!==je&&(i.clearStencil(je),At=je)},reset:function(){C=!1,le=null,B=null,ee=null,re=null,Oe=null,We=null,Ye=null,At=null}}}let a=new s,l=new r,c=new o,h=new WeakMap,d=new WeakMap,f={},m={},g=new WeakMap,_=[],p=null,u=!1,S=null,y=null,R=null,w=null,P=null,T=null,k=null,v=!1,E=null,Z=null,te=null,F=null,H=null,V=i.getParameter(i.MAX_COMBINED_TEXTURE_IMAGE_UNITS),K=!1,X=0,q=i.getParameter(i.VERSION);q.indexOf("WebGL")!==-1?(X=parseFloat(/^WebGL (\d)/.exec(q)[1]),K=X>=1):q.indexOf("OpenGL ES")!==-1&&(X=parseFloat(/^OpenGL ES (\d)/.exec(q)[1]),K=X>=2);let J=null,$={},O=i.getParameter(i.SCISSOR_BOX),Y=i.getParameter(i.VIEWPORT),ue=new Ke().fromArray(O),de=new Ke().fromArray(Y);function fe(C,le,B,ee){let re=new Uint8Array(4),Oe=i.createTexture();i.bindTexture(C,Oe),i.texParameteri(C,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(C,i.TEXTURE_MAG_FILTER,i.NEAREST);for(let We=0;We<B;We++)n&&(C===i.TEXTURE_3D||C===i.TEXTURE_2D_ARRAY)?i.texImage3D(le,0,i.RGBA,1,1,ee,0,i.RGBA,i.UNSIGNED_BYTE,re):i.texImage2D(le+We,0,i.RGBA,1,1,0,i.RGBA,i.UNSIGNED_BYTE,re);return Oe}let ve={};ve[i.TEXTURE_2D]=fe(i.TEXTURE_2D,i.TEXTURE_2D,1),ve[i.TEXTURE_CUBE_MAP]=fe(i.TEXTURE_CUBE_MAP,i.TEXTURE_CUBE_MAP_POSITIVE_X,6),n&&(ve[i.TEXTURE_2D_ARRAY]=fe(i.TEXTURE_2D_ARRAY,i.TEXTURE_2D_ARRAY,1,1),ve[i.TEXTURE_3D]=fe(i.TEXTURE_3D,i.TEXTURE_3D,1,1)),a.setClear(0,0,0,1),l.setClear(1),c.setClear(0),Ee(i.DEPTH_TEST),l.setFunc(Jr),be(!1),Ze(so),Ee(i.CULL_FACE),xe(nn);function Ee(C){f[C]!==!0&&(i.enable(C),f[C]=!0)}function _e(C){f[C]!==!1&&(i.disable(C),f[C]=!1)}function ke(C,le){return m[C]!==le?(i.bindFramebuffer(C,le),m[C]=le,n&&(C===i.DRAW_FRAMEBUFFER&&(m[i.FRAMEBUFFER]=le),C===i.FRAMEBUFFER&&(m[i.DRAW_FRAMEBUFFER]=le)),!0):!1}function pt(C,le){let B=_,ee=!1;if(C)if(B=g.get(le),B===void 0&&(B=[],g.set(le,B)),C.isWebGLMultipleRenderTargets){let re=C.texture;if(B.length!==re.length||B[0]!==i.COLOR_ATTACHMENT0){for(let Oe=0,We=re.length;Oe<We;Oe++)B[Oe]=i.COLOR_ATTACHMENT0+Oe;B.length=re.length,ee=!0}}else B[0]!==i.COLOR_ATTACHMENT0&&(B[0]=i.COLOR_ATTACHMENT0,ee=!0);else B[0]!==i.BACK&&(B[0]=i.BACK,ee=!0);ee&&(t.isWebGL2?i.drawBuffers(B):e.get("WEBGL_draw_buffers").drawBuffersWEBGL(B))}function Ce(C){return p!==C?(i.useProgram(C),p=C,!0):!1}let D={[_i]:i.FUNC_ADD,[Il]:i.FUNC_SUBTRACT,[Dl]:i.FUNC_REVERSE_SUBTRACT};if(n)D[lo]=i.MIN,D[co]=i.MAX;else{let C=e.get("EXT_blend_minmax");C!==null&&(D[lo]=C.MIN_EXT,D[co]=C.MAX_EXT)}let at={[Ul]:i.ZERO,[Ol]:i.ONE,[Nl]:i.SRC_COLOR,[P0]:i.SRC_ALPHA,[Hl]:i.SRC_ALPHA_SATURATE,[kl]:i.DST_COLOR,[zl]:i.DST_ALPHA,[Fl]:i.ONE_MINUS_SRC_COLOR,[L0]:i.ONE_MINUS_SRC_ALPHA,[Vl]:i.ONE_MINUS_DST_COLOR,[Bl]:i.ONE_MINUS_DST_ALPHA};function xe(C,le,B,ee,re,Oe,We,Ye){if(C===nn){u===!0&&(_e(i.BLEND),u=!1);return}if(u===!1&&(Ee(i.BLEND),u=!0),C!==Ll){if(C!==S||Ye!==v){if((y!==_i||P!==_i)&&(i.blendEquation(i.FUNC_ADD),y=_i,P=_i),Ye)switch(C){case yi:i.blendFuncSeparate(i.ONE,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case ro:i.blendFunc(i.ONE,i.ONE);break;case ao:i.blendFuncSeparate(i.ZERO,i.ONE_MINUS_SRC_COLOR,i.ZERO,i.ONE);break;case oo:i.blendFuncSeparate(i.ZERO,i.SRC_COLOR,i.ZERO,i.SRC_ALPHA);break;default:console.error("THREE.WebGLState: Invalid blending: ",C);break}else switch(C){case yi:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case ro:i.blendFunc(i.SRC_ALPHA,i.ONE);break;case ao:i.blendFuncSeparate(i.ZERO,i.ONE_MINUS_SRC_COLOR,i.ZERO,i.ONE);break;case oo:i.blendFunc(i.ZERO,i.SRC_COLOR);break;default:console.error("THREE.WebGLState: Invalid blending: ",C);break}R=null,w=null,T=null,k=null,S=C,v=Ye}return}re=re||le,Oe=Oe||B,We=We||ee,(le!==y||re!==P)&&(i.blendEquationSeparate(D[le],D[re]),y=le,P=re),(B!==R||ee!==w||Oe!==T||We!==k)&&(i.blendFuncSeparate(at[B],at[ee],at[Oe],at[We]),R=B,w=ee,T=Oe,k=We),S=C,v=!1}function Ae(C,le){C.side===vt?_e(i.CULL_FACE):Ee(i.CULL_FACE);let B=C.side===Tt;le&&(B=!B),be(B),C.blending===yi&&C.transparent===!1?xe(nn):xe(C.blending,C.blendEquation,C.blendSrc,C.blendDst,C.blendEquationAlpha,C.blendSrcAlpha,C.blendDstAlpha,C.premultipliedAlpha),l.setFunc(C.depthFunc),l.setTest(C.depthTest),l.setMask(C.depthWrite),a.setMask(C.colorWrite);let ee=C.stencilWrite;c.setTest(ee),ee&&(c.setMask(C.stencilWriteMask),c.setFunc(C.stencilFunc,C.stencilRef,C.stencilFuncMask),c.setOp(C.stencilFail,C.stencilZFail,C.stencilZPass)),Re(C.polygonOffset,C.polygonOffsetFactor,C.polygonOffsetUnits),C.alphaToCoverage===!0?Ee(i.SAMPLE_ALPHA_TO_COVERAGE):_e(i.SAMPLE_ALPHA_TO_COVERAGE)}function be(C){E!==C&&(C?i.frontFace(i.CW):i.frontFace(i.CCW),E=C)}function Ze(C){C!==Rl?(Ee(i.CULL_FACE),C!==Z&&(C===so?i.cullFace(i.BACK):C===Cl?i.cullFace(i.FRONT):i.cullFace(i.FRONT_AND_BACK))):_e(i.CULL_FACE),Z=C}function Ie(C){C!==te&&(K&&i.lineWidth(C),te=C)}function Re(C,le,B){C?(Ee(i.POLYGON_OFFSET_FILL),(F!==le||H!==B)&&(i.polygonOffset(le,B),F=le,H=B)):_e(i.POLYGON_OFFSET_FILL)}function Ve(C){C?Ee(i.SCISSOR_TEST):_e(i.SCISSOR_TEST)}function ot(C){C===void 0&&(C=i.TEXTURE0+V-1),J!==C&&(i.activeTexture(C),J=C)}function ut(C,le,B){B===void 0&&(J===null?B=i.TEXTURE0+V-1:B=J);let ee=$[B];ee===void 0&&(ee={type:void 0,texture:void 0},$[B]=ee),(ee.type!==C||ee.texture!==le)&&(J!==B&&(i.activeTexture(B),J=B),i.bindTexture(C,le||ve[C]),ee.type=C,ee.texture=le)}function b(){let C=$[J];C!==void 0&&C.type!==void 0&&(i.bindTexture(C.type,null),C.type=void 0,C.texture=void 0)}function x(){try{i.compressedTexImage2D.apply(i,arguments)}catch(C){console.error("THREE.WebGLState:",C)}}function N(){try{i.compressedTexImage3D.apply(i,arguments)}catch(C){console.error("THREE.WebGLState:",C)}}function ne(){try{i.texSubImage2D.apply(i,arguments)}catch(C){console.error("THREE.WebGLState:",C)}}function Q(){try{i.texSubImage3D.apply(i,arguments)}catch(C){console.error("THREE.WebGLState:",C)}}function ie(){try{i.compressedTexSubImage2D.apply(i,arguments)}catch(C){console.error("THREE.WebGLState:",C)}}function ge(){try{i.compressedTexSubImage3D.apply(i,arguments)}catch(C){console.error("THREE.WebGLState:",C)}}function se(){try{i.texStorage2D.apply(i,arguments)}catch(C){console.error("THREE.WebGLState:",C)}}function z(){try{i.texStorage3D.apply(i,arguments)}catch(C){console.error("THREE.WebGLState:",C)}}function A(){try{i.texImage2D.apply(i,arguments)}catch(C){console.error("THREE.WebGLState:",C)}}function j(){try{i.texImage3D.apply(i,arguments)}catch(C){console.error("THREE.WebGLState:",C)}}function he(C){ue.equals(C)===!1&&(i.scissor(C.x,C.y,C.z,C.w),ue.copy(C))}function ae(C){de.equals(C)===!1&&(i.viewport(C.x,C.y,C.z,C.w),de.copy(C))}function ce(C,le){let B=d.get(le);B===void 0&&(B=new WeakMap,d.set(le,B));let ee=B.get(C);ee===void 0&&(ee=i.getUniformBlockIndex(le,C.name),B.set(C,ee))}function Te(C,le){let ee=d.get(le).get(C);h.get(le)!==ee&&(i.uniformBlockBinding(le,ee,C.__bindingPointIndex),h.set(le,ee))}function Be(){i.disable(i.BLEND),i.disable(i.CULL_FACE),i.disable(i.DEPTH_TEST),i.disable(i.POLYGON_OFFSET_FILL),i.disable(i.SCISSOR_TEST),i.disable(i.STENCIL_TEST),i.disable(i.SAMPLE_ALPHA_TO_COVERAGE),i.blendEquation(i.FUNC_ADD),i.blendFunc(i.ONE,i.ZERO),i.blendFuncSeparate(i.ONE,i.ZERO,i.ONE,i.ZERO),i.colorMask(!0,!0,!0,!0),i.clearColor(0,0,0,0),i.depthMask(!0),i.depthFunc(i.LESS),i.clearDepth(1),i.stencilMask(4294967295),i.stencilFunc(i.ALWAYS,0,4294967295),i.stencilOp(i.KEEP,i.KEEP,i.KEEP),i.clearStencil(0),i.cullFace(i.BACK),i.frontFace(i.CCW),i.polygonOffset(0,0),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null),n===!0&&(i.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),i.bindFramebuffer(i.READ_FRAMEBUFFER,null)),i.useProgram(null),i.lineWidth(1),i.scissor(0,0,i.canvas.width,i.canvas.height),i.viewport(0,0,i.canvas.width,i.canvas.height),f={},J=null,$={},m={},g=new WeakMap,_=[],p=null,u=!1,S=null,y=null,R=null,w=null,P=null,T=null,k=null,v=!1,E=null,Z=null,te=null,F=null,H=null,ue.set(0,0,i.canvas.width,i.canvas.height),de.set(0,0,i.canvas.width,i.canvas.height),a.reset(),l.reset(),c.reset()}return{buffers:{color:a,depth:l,stencil:c},enable:Ee,disable:_e,bindFramebuffer:ke,drawBuffers:pt,useProgram:Ce,setBlending:xe,setMaterial:Ae,setFlipSided:be,setCullFace:Ze,setLineWidth:Ie,setPolygonOffset:Re,setScissorTest:Ve,activeTexture:ot,bindTexture:ut,unbindTexture:b,compressedTexImage2D:x,compressedTexImage3D:N,texImage2D:A,texImage3D:j,updateUBOMapping:ce,uniformBlockBinding:Te,texStorage2D:se,texStorage3D:z,texSubImage2D:ne,texSubImage3D:Q,compressedTexSubImage2D:ie,compressedTexSubImage3D:ge,scissor:he,viewport:ae,reset:Be}}function Ap(i,e,t,n,s,r,o){let a=s.isWebGL2,l=s.maxTextures,c=s.maxCubemapSize,h=s.maxTextureSize,d=s.maxSamples,f=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,m=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),g=new WeakMap,_,p=new WeakMap,u=!1;try{u=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function S(b,x){return u?new OffscreenCanvas(b,x):Us("canvas")}function y(b,x,N,ne){let Q=1;if((b.width>ne||b.height>ne)&&(Q=ne/Math.max(b.width,b.height)),Q<1||x===!0)if(typeof HTMLImageElement<"u"&&b instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&b instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&b instanceof ImageBitmap){let ie=x?Ds:Math.floor,ge=ie(Q*b.width),se=ie(Q*b.height);_===void 0&&(_=S(ge,se));let z=N?S(ge,se):_;return z.width=ge,z.height=se,z.getContext("2d").drawImage(b,0,0,ge,se),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+b.width+"x"+b.height+") to ("+ge+"x"+se+")."),z}else return"data"in b&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+b.width+"x"+b.height+")."),b;return b}function R(b){return na(b.width)&&na(b.height)}function w(b){return a?!1:b.wrapS!==Zt||b.wrapT!==Zt||b.minFilter!==He&&b.minFilter!==zt}function P(b,x){return b.generateMipmaps&&x&&b.minFilter!==He&&b.minFilter!==zt}function T(b){i.generateMipmap(b)}function k(b,x,N,ne,Q=!1){if(a===!1)return x;if(b!==null){if(i[b]!==void 0)return i[b];console.warn("THREE.WebGLRenderer: Attempt to use non-existing WebGL internal format '"+b+"'")}let ie=x;return x===i.RED&&(N===i.FLOAT&&(ie=i.R32F),N===i.HALF_FLOAT&&(ie=i.R16F),N===i.UNSIGNED_BYTE&&(ie=i.R8)),x===i.RED_INTEGER&&(N===i.UNSIGNED_BYTE&&(ie=i.R8UI),N===i.UNSIGNED_SHORT&&(ie=i.R16UI),N===i.UNSIGNED_INT&&(ie=i.R32UI),N===i.BYTE&&(ie=i.R8I),N===i.SHORT&&(ie=i.R16I),N===i.INT&&(ie=i.R32I)),x===i.RG&&(N===i.FLOAT&&(ie=i.RG32F),N===i.HALF_FLOAT&&(ie=i.RG16F),N===i.UNSIGNED_BYTE&&(ie=i.RG8)),x===i.RGBA&&(N===i.FLOAT&&(ie=i.RGBA32F),N===i.HALF_FLOAT&&(ie=i.RGBA16F),N===i.UNSIGNED_BYTE&&(ie=ne===Xe&&Q===!1?i.SRGB8_ALPHA8:i.RGBA8),N===i.UNSIGNED_SHORT_4_4_4_4&&(ie=i.RGBA4),N===i.UNSIGNED_SHORT_5_5_5_1&&(ie=i.RGB5_A1)),(ie===i.R16F||ie===i.R32F||ie===i.RG16F||ie===i.RG32F||ie===i.RGBA16F||ie===i.RGBA32F)&&e.get("EXT_color_buffer_float"),ie}function v(b,x,N){return P(b,N)===!0||b.isFramebufferTexture&&b.minFilter!==He&&b.minFilter!==zt?Math.log2(Math.max(x.width,x.height))+1:b.mipmaps!==void 0&&b.mipmaps.length>0?b.mipmaps.length:b.isCompressedTexture&&Array.isArray(b.image)?x.mipmaps.length:1}function E(b){return b===He||b===ho||b===yr?i.NEAREST:i.LINEAR}function Z(b){let x=b.target;x.removeEventListener("dispose",Z),F(x),x.isVideoTexture&&g.delete(x)}function te(b){let x=b.target;x.removeEventListener("dispose",te),V(x)}function F(b){let x=n.get(b);if(x.__webglInit===void 0)return;let N=b.source,ne=p.get(N);if(ne){let Q=ne[x.__cacheKey];Q.usedTimes--,Q.usedTimes===0&&H(b),Object.keys(ne).length===0&&p.delete(N)}n.remove(b)}function H(b){let x=n.get(b);i.deleteTexture(x.__webglTexture);let N=b.source,ne=p.get(N);delete ne[x.__cacheKey],o.memory.textures--}function V(b){let x=b.texture,N=n.get(b),ne=n.get(x);if(ne.__webglTexture!==void 0&&(i.deleteTexture(ne.__webglTexture),o.memory.textures--),b.depthTexture&&b.depthTexture.dispose(),b.isWebGLCubeRenderTarget)for(let Q=0;Q<6;Q++){if(Array.isArray(N.__webglFramebuffer[Q]))for(let ie=0;ie<N.__webglFramebuffer[Q].length;ie++)i.deleteFramebuffer(N.__webglFramebuffer[Q][ie]);else i.deleteFramebuffer(N.__webglFramebuffer[Q]);N.__webglDepthbuffer&&i.deleteRenderbuffer(N.__webglDepthbuffer[Q])}else{if(Array.isArray(N.__webglFramebuffer))for(let Q=0;Q<N.__webglFramebuffer.length;Q++)i.deleteFramebuffer(N.__webglFramebuffer[Q]);else i.deleteFramebuffer(N.__webglFramebuffer);if(N.__webglDepthbuffer&&i.deleteRenderbuffer(N.__webglDepthbuffer),N.__webglMultisampledFramebuffer&&i.deleteFramebuffer(N.__webglMultisampledFramebuffer),N.__webglColorRenderbuffer)for(let Q=0;Q<N.__webglColorRenderbuffer.length;Q++)N.__webglColorRenderbuffer[Q]&&i.deleteRenderbuffer(N.__webglColorRenderbuffer[Q]);N.__webglDepthRenderbuffer&&i.deleteRenderbuffer(N.__webglDepthRenderbuffer)}if(b.isWebGLMultipleRenderTargets)for(let Q=0,ie=x.length;Q<ie;Q++){let ge=n.get(x[Q]);ge.__webglTexture&&(i.deleteTexture(ge.__webglTexture),o.memory.textures--),n.remove(x[Q])}n.remove(x),n.remove(b)}let K=0;function X(){K=0}function q(){let b=K;return b>=l&&console.warn("THREE.WebGLTextures: Trying to use "+b+" texture units while this GPU supports only "+l),K+=1,b}function J(b){let x=[];return x.push(b.wrapS),x.push(b.wrapT),x.push(b.wrapR||0),x.push(b.magFilter),x.push(b.minFilter),x.push(b.anisotropy),x.push(b.internalFormat),x.push(b.format),x.push(b.type),x.push(b.generateMipmaps),x.push(b.premultiplyAlpha),x.push(b.flipY),x.push(b.unpackAlignment),x.push(b.colorSpace),x.join()}function $(b,x){let N=n.get(b);if(b.isVideoTexture&&ot(b),b.isRenderTargetTexture===!1&&b.version>0&&N.__version!==b.version){let ne=b.image;if(ne===null)console.warn("THREE.WebGLRenderer: Texture marked for update but no image data found.");else if(ne.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{ke(N,b,x);return}}t.bindTexture(i.TEXTURE_2D,N.__webglTexture,i.TEXTURE0+x)}function O(b,x){let N=n.get(b);if(b.version>0&&N.__version!==b.version){ke(N,b,x);return}t.bindTexture(i.TEXTURE_2D_ARRAY,N.__webglTexture,i.TEXTURE0+x)}function Y(b,x){let N=n.get(b);if(b.version>0&&N.__version!==b.version){ke(N,b,x);return}t.bindTexture(i.TEXTURE_3D,N.__webglTexture,i.TEXTURE0+x)}function ue(b,x){let N=n.get(b);if(b.version>0&&N.__version!==b.version){pt(N,b,x);return}t.bindTexture(i.TEXTURE_CUBE_MAP,N.__webglTexture,i.TEXTURE0+x)}let de={[Kr]:i.REPEAT,[Zt]:i.CLAMP_TO_EDGE,[Qr]:i.MIRRORED_REPEAT},fe={[He]:i.NEAREST,[ho]:i.NEAREST_MIPMAP_NEAREST,[yr]:i.NEAREST_MIPMAP_LINEAR,[zt]:i.LINEAR,[ic]:i.LINEAR_MIPMAP_NEAREST,[Xi]:i.LINEAR_MIPMAP_LINEAR},ve={[_c]:i.NEVER,[wc]:i.ALWAYS,[xc]:i.LESS,[vc]:i.LEQUAL,[yc]:i.EQUAL,[Sc]:i.GEQUAL,[Mc]:i.GREATER,[bc]:i.NOTEQUAL};function Ee(b,x,N){if(N?(i.texParameteri(b,i.TEXTURE_WRAP_S,de[x.wrapS]),i.texParameteri(b,i.TEXTURE_WRAP_T,de[x.wrapT]),(b===i.TEXTURE_3D||b===i.TEXTURE_2D_ARRAY)&&i.texParameteri(b,i.TEXTURE_WRAP_R,de[x.wrapR]),i.texParameteri(b,i.TEXTURE_MAG_FILTER,fe[x.magFilter]),i.texParameteri(b,i.TEXTURE_MIN_FILTER,fe[x.minFilter])):(i.texParameteri(b,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(b,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),(b===i.TEXTURE_3D||b===i.TEXTURE_2D_ARRAY)&&i.texParameteri(b,i.TEXTURE_WRAP_R,i.CLAMP_TO_EDGE),(x.wrapS!==Zt||x.wrapT!==Zt)&&console.warn("THREE.WebGLRenderer: Texture is not power of two. Texture.wrapS and Texture.wrapT should be set to THREE.ClampToEdgeWrapping."),i.texParameteri(b,i.TEXTURE_MAG_FILTER,E(x.magFilter)),i.texParameteri(b,i.TEXTURE_MIN_FILTER,E(x.minFilter)),x.minFilter!==He&&x.minFilter!==zt&&console.warn("THREE.WebGLRenderer: Texture is not power of two. Texture.minFilter should be set to THREE.NearestFilter or THREE.LinearFilter.")),x.compareFunction&&(i.texParameteri(b,i.TEXTURE_COMPARE_MODE,i.COMPARE_REF_TO_TEXTURE),i.texParameteri(b,i.TEXTURE_COMPARE_FUNC,ve[x.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){let ne=e.get("EXT_texture_filter_anisotropic");if(x.magFilter===He||x.minFilter!==yr&&x.minFilter!==Xi||x.type===tn&&e.has("OES_texture_float_linear")===!1||a===!1&&x.type===Wn&&e.has("OES_texture_half_float_linear")===!1)return;(x.anisotropy>1||n.get(x).__currentAnisotropy)&&(i.texParameterf(b,ne.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(x.anisotropy,s.getMaxAnisotropy())),n.get(x).__currentAnisotropy=x.anisotropy)}}function _e(b,x){let N=!1;b.__webglInit===void 0&&(b.__webglInit=!0,x.addEventListener("dispose",Z));let ne=x.source,Q=p.get(ne);Q===void 0&&(Q={},p.set(ne,Q));let ie=J(x);if(ie!==b.__cacheKey){Q[ie]===void 0&&(Q[ie]={texture:i.createTexture(),usedTimes:0},o.memory.textures++,N=!0),Q[ie].usedTimes++;let ge=Q[b.__cacheKey];ge!==void 0&&(Q[b.__cacheKey].usedTimes--,ge.usedTimes===0&&H(x)),b.__cacheKey=ie,b.__webglTexture=Q[ie].texture}return N}function ke(b,x,N){let ne=i.TEXTURE_2D;(x.isDataArrayTexture||x.isCompressedArrayTexture)&&(ne=i.TEXTURE_2D_ARRAY),x.isData3DTexture&&(ne=i.TEXTURE_3D);let Q=_e(b,x),ie=x.source;t.bindTexture(ne,b.__webglTexture,i.TEXTURE0+N);let ge=n.get(ie);if(ie.version!==ge.__version||Q===!0){t.activeTexture(i.TEXTURE0+N),i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,x.flipY),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),i.pixelStorei(i.UNPACK_ALIGNMENT,x.unpackAlignment),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,i.NONE);let se=w(x)&&R(x.image)===!1,z=y(x.image,se,!1,h);z=ut(x,z);let A=R(z)||a,j=r.convert(x.format,x.colorSpace),he=r.convert(x.type),ae=k(x.internalFormat,j,he,x.colorSpace,x.isVideoTexture);Ee(ne,x,A);let ce,Te=x.mipmaps,Be=a&&x.isVideoTexture!==!0,C=ge.__version===void 0||Q===!0,le=v(x,z,A);if(x.isDepthTexture)ae=i.DEPTH_COMPONENT,a?x.type===tn?ae=i.DEPTH_COMPONENT32F:x.type===En?ae=i.DEPTH_COMPONENT24:x.type===kn?ae=i.DEPTH24_STENCIL8:ae=i.DEPTH_COMPONENT16:x.type===tn&&console.error("WebGLRenderer: Floating point depth texture requires WebGL2."),x.format===Vn&&ae===i.DEPTH_COMPONENT&&x.type!==Ia&&x.type!==En&&(console.warn("THREE.WebGLRenderer: Use UnsignedShortType or UnsignedIntType for DepthFormat DepthTexture."),x.type=En,he=r.convert(x.type)),x.format===wi&&ae===i.DEPTH_COMPONENT&&(ae=i.DEPTH_STENCIL,x.type!==kn&&(console.warn("THREE.WebGLRenderer: Use UnsignedInt248Type for DepthStencilFormat DepthTexture."),x.type=kn,he=r.convert(x.type))),C&&(Be?t.texStorage2D(i.TEXTURE_2D,1,ae,z.width,z.height):t.texImage2D(i.TEXTURE_2D,0,ae,z.width,z.height,0,j,he,null));else if(x.isDataTexture)if(Te.length>0&&A){Be&&C&&t.texStorage2D(i.TEXTURE_2D,le,ae,Te[0].width,Te[0].height);for(let B=0,ee=Te.length;B<ee;B++)ce=Te[B],Be?t.texSubImage2D(i.TEXTURE_2D,B,0,0,ce.width,ce.height,j,he,ce.data):t.texImage2D(i.TEXTURE_2D,B,ae,ce.width,ce.height,0,j,he,ce.data);x.generateMipmaps=!1}else Be?(C&&t.texStorage2D(i.TEXTURE_2D,le,ae,z.width,z.height),t.texSubImage2D(i.TEXTURE_2D,0,0,0,z.width,z.height,j,he,z.data)):t.texImage2D(i.TEXTURE_2D,0,ae,z.width,z.height,0,j,he,z.data);else if(x.isCompressedTexture)if(x.isCompressedArrayTexture){Be&&C&&t.texStorage3D(i.TEXTURE_2D_ARRAY,le,ae,Te[0].width,Te[0].height,z.depth);for(let B=0,ee=Te.length;B<ee;B++)ce=Te[B],x.format!==jt?j!==null?Be?t.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,B,0,0,0,ce.width,ce.height,z.depth,j,ce.data,0,0):t.compressedTexImage3D(i.TEXTURE_2D_ARRAY,B,ae,ce.width,ce.height,z.depth,0,ce.data,0,0):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):Be?t.texSubImage3D(i.TEXTURE_2D_ARRAY,B,0,0,0,ce.width,ce.height,z.depth,j,he,ce.data):t.texImage3D(i.TEXTURE_2D_ARRAY,B,ae,ce.width,ce.height,z.depth,0,j,he,ce.data)}else{Be&&C&&t.texStorage2D(i.TEXTURE_2D,le,ae,Te[0].width,Te[0].height);for(let B=0,ee=Te.length;B<ee;B++)ce=Te[B],x.format!==jt?j!==null?Be?t.compressedTexSubImage2D(i.TEXTURE_2D,B,0,0,ce.width,ce.height,j,ce.data):t.compressedTexImage2D(i.TEXTURE_2D,B,ae,ce.width,ce.height,0,ce.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):Be?t.texSubImage2D(i.TEXTURE_2D,B,0,0,ce.width,ce.height,j,he,ce.data):t.texImage2D(i.TEXTURE_2D,B,ae,ce.width,ce.height,0,j,he,ce.data)}else if(x.isDataArrayTexture)Be?(C&&t.texStorage3D(i.TEXTURE_2D_ARRAY,le,ae,z.width,z.height,z.depth),t.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,0,z.width,z.height,z.depth,j,he,z.data)):t.texImage3D(i.TEXTURE_2D_ARRAY,0,ae,z.width,z.height,z.depth,0,j,he,z.data);else if(x.isData3DTexture)Be?(C&&t.texStorage3D(i.TEXTURE_3D,le,ae,z.width,z.height,z.depth),t.texSubImage3D(i.TEXTURE_3D,0,0,0,0,z.width,z.height,z.depth,j,he,z.data)):t.texImage3D(i.TEXTURE_3D,0,ae,z.width,z.height,z.depth,0,j,he,z.data);else if(x.isFramebufferTexture){if(C)if(Be)t.texStorage2D(i.TEXTURE_2D,le,ae,z.width,z.height);else{let B=z.width,ee=z.height;for(let re=0;re<le;re++)t.texImage2D(i.TEXTURE_2D,re,ae,B,ee,0,j,he,null),B>>=1,ee>>=1}}else if(Te.length>0&&A){Be&&C&&t.texStorage2D(i.TEXTURE_2D,le,ae,Te[0].width,Te[0].height);for(let B=0,ee=Te.length;B<ee;B++)ce=Te[B],Be?t.texSubImage2D(i.TEXTURE_2D,B,0,0,j,he,ce):t.texImage2D(i.TEXTURE_2D,B,ae,j,he,ce);x.generateMipmaps=!1}else Be?(C&&t.texStorage2D(i.TEXTURE_2D,le,ae,z.width,z.height),t.texSubImage2D(i.TEXTURE_2D,0,0,0,j,he,z)):t.texImage2D(i.TEXTURE_2D,0,ae,j,he,z);P(x,A)&&T(ne),ge.__version=ie.version,x.onUpdate&&x.onUpdate(x)}b.__version=x.version}function pt(b,x,N){if(x.image.length!==6)return;let ne=_e(b,x),Q=x.source;t.bindTexture(i.TEXTURE_CUBE_MAP,b.__webglTexture,i.TEXTURE0+N);let ie=n.get(Q);if(Q.version!==ie.__version||ne===!0){t.activeTexture(i.TEXTURE0+N),i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,x.flipY),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),i.pixelStorei(i.UNPACK_ALIGNMENT,x.unpackAlignment),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,i.NONE);let ge=x.isCompressedTexture||x.image[0].isCompressedTexture,se=x.image[0]&&x.image[0].isDataTexture,z=[];for(let B=0;B<6;B++)!ge&&!se?z[B]=y(x.image[B],!1,!0,c):z[B]=se?x.image[B].image:x.image[B],z[B]=ut(x,z[B]);let A=z[0],j=R(A)||a,he=r.convert(x.format,x.colorSpace),ae=r.convert(x.type),ce=k(x.internalFormat,he,ae,x.colorSpace),Te=a&&x.isVideoTexture!==!0,Be=ie.__version===void 0||ne===!0,C=v(x,A,j);Ee(i.TEXTURE_CUBE_MAP,x,j);let le;if(ge){Te&&Be&&t.texStorage2D(i.TEXTURE_CUBE_MAP,C,ce,A.width,A.height);for(let B=0;B<6;B++){le=z[B].mipmaps;for(let ee=0;ee<le.length;ee++){let re=le[ee];x.format!==jt?he!==null?Te?t.compressedTexSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+B,ee,0,0,re.width,re.height,he,re.data):t.compressedTexImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+B,ee,ce,re.width,re.height,0,re.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):Te?t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+B,ee,0,0,re.width,re.height,he,ae,re.data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+B,ee,ce,re.width,re.height,0,he,ae,re.data)}}}else{le=x.mipmaps,Te&&Be&&(le.length>0&&C++,t.texStorage2D(i.TEXTURE_CUBE_MAP,C,ce,z[0].width,z[0].height));for(let B=0;B<6;B++)if(se){Te?t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+B,0,0,0,z[B].width,z[B].height,he,ae,z[B].data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+B,0,ce,z[B].width,z[B].height,0,he,ae,z[B].data);for(let ee=0;ee<le.length;ee++){let Oe=le[ee].image[B].image;Te?t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+B,ee+1,0,0,Oe.width,Oe.height,he,ae,Oe.data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+B,ee+1,ce,Oe.width,Oe.height,0,he,ae,Oe.data)}}else{Te?t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+B,0,0,0,he,ae,z[B]):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+B,0,ce,he,ae,z[B]);for(let ee=0;ee<le.length;ee++){let re=le[ee];Te?t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+B,ee+1,0,0,he,ae,re.image[B]):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+B,ee+1,ce,he,ae,re.image[B])}}}P(x,j)&&T(i.TEXTURE_CUBE_MAP),ie.__version=Q.version,x.onUpdate&&x.onUpdate(x)}b.__version=x.version}function Ce(b,x,N,ne,Q,ie){let ge=r.convert(N.format,N.colorSpace),se=r.convert(N.type),z=k(N.internalFormat,ge,se,N.colorSpace);if(!n.get(x).__hasExternalTextures){let j=Math.max(1,x.width>>ie),he=Math.max(1,x.height>>ie);Q===i.TEXTURE_3D||Q===i.TEXTURE_2D_ARRAY?t.texImage3D(Q,ie,z,j,he,x.depth,0,ge,se,null):t.texImage2D(Q,ie,z,j,he,0,ge,se,null)}t.bindFramebuffer(i.FRAMEBUFFER,b),Ve(x)?f.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,ne,Q,n.get(N).__webglTexture,0,Re(x)):(Q===i.TEXTURE_2D||Q>=i.TEXTURE_CUBE_MAP_POSITIVE_X&&Q<=i.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&i.framebufferTexture2D(i.FRAMEBUFFER,ne,Q,n.get(N).__webglTexture,ie),t.bindFramebuffer(i.FRAMEBUFFER,null)}function D(b,x,N){if(i.bindRenderbuffer(i.RENDERBUFFER,b),x.depthBuffer&&!x.stencilBuffer){let ne=i.DEPTH_COMPONENT16;if(N||Ve(x)){let Q=x.depthTexture;Q&&Q.isDepthTexture&&(Q.type===tn?ne=i.DEPTH_COMPONENT32F:Q.type===En&&(ne=i.DEPTH_COMPONENT24));let ie=Re(x);Ve(x)?f.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,ie,ne,x.width,x.height):i.renderbufferStorageMultisample(i.RENDERBUFFER,ie,ne,x.width,x.height)}else i.renderbufferStorage(i.RENDERBUFFER,ne,x.width,x.height);i.framebufferRenderbuffer(i.FRAMEBUFFER,i.DEPTH_ATTACHMENT,i.RENDERBUFFER,b)}else if(x.depthBuffer&&x.stencilBuffer){let ne=Re(x);N&&Ve(x)===!1?i.renderbufferStorageMultisample(i.RENDERBUFFER,ne,i.DEPTH24_STENCIL8,x.width,x.height):Ve(x)?f.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,ne,i.DEPTH24_STENCIL8,x.width,x.height):i.renderbufferStorage(i.RENDERBUFFER,i.DEPTH_STENCIL,x.width,x.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.DEPTH_STENCIL_ATTACHMENT,i.RENDERBUFFER,b)}else{let ne=x.isWebGLMultipleRenderTargets===!0?x.texture:[x.texture];for(let Q=0;Q<ne.length;Q++){let ie=ne[Q],ge=r.convert(ie.format,ie.colorSpace),se=r.convert(ie.type),z=k(ie.internalFormat,ge,se,ie.colorSpace),A=Re(x);N&&Ve(x)===!1?i.renderbufferStorageMultisample(i.RENDERBUFFER,A,z,x.width,x.height):Ve(x)?f.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,A,z,x.width,x.height):i.renderbufferStorage(i.RENDERBUFFER,z,x.width,x.height)}}i.bindRenderbuffer(i.RENDERBUFFER,null)}function at(b,x){if(x&&x.isWebGLCubeRenderTarget)throw new Error("Depth Texture with cube render targets is not supported");if(t.bindFramebuffer(i.FRAMEBUFFER,b),!(x.depthTexture&&x.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");(!n.get(x.depthTexture).__webglTexture||x.depthTexture.image.width!==x.width||x.depthTexture.image.height!==x.height)&&(x.depthTexture.image.width=x.width,x.depthTexture.image.height=x.height,x.depthTexture.needsUpdate=!0),$(x.depthTexture,0);let ne=n.get(x.depthTexture).__webglTexture,Q=Re(x);if(x.depthTexture.format===Vn)Ve(x)?f.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,i.DEPTH_ATTACHMENT,i.TEXTURE_2D,ne,0,Q):i.framebufferTexture2D(i.FRAMEBUFFER,i.DEPTH_ATTACHMENT,i.TEXTURE_2D,ne,0);else if(x.depthTexture.format===wi)Ve(x)?f.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,i.DEPTH_STENCIL_ATTACHMENT,i.TEXTURE_2D,ne,0,Q):i.framebufferTexture2D(i.FRAMEBUFFER,i.DEPTH_STENCIL_ATTACHMENT,i.TEXTURE_2D,ne,0);else throw new Error("Unknown depthTexture format")}function xe(b){let x=n.get(b),N=b.isWebGLCubeRenderTarget===!0;if(b.depthTexture&&!x.__autoAllocateDepthBuffer){if(N)throw new Error("target.depthTexture not supported in Cube render targets");at(x.__webglFramebuffer,b)}else if(N){x.__webglDepthbuffer=[];for(let ne=0;ne<6;ne++)t.bindFramebuffer(i.FRAMEBUFFER,x.__webglFramebuffer[ne]),x.__webglDepthbuffer[ne]=i.createRenderbuffer(),D(x.__webglDepthbuffer[ne],b,!1)}else t.bindFramebuffer(i.FRAMEBUFFER,x.__webglFramebuffer),x.__webglDepthbuffer=i.createRenderbuffer(),D(x.__webglDepthbuffer,b,!1);t.bindFramebuffer(i.FRAMEBUFFER,null)}function Ae(b,x,N){let ne=n.get(b);x!==void 0&&Ce(ne.__webglFramebuffer,b,b.texture,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,0),N!==void 0&&xe(b)}function be(b){let x=b.texture,N=n.get(b),ne=n.get(x);b.addEventListener("dispose",te),b.isWebGLMultipleRenderTargets!==!0&&(ne.__webglTexture===void 0&&(ne.__webglTexture=i.createTexture()),ne.__version=x.version,o.memory.textures++);let Q=b.isWebGLCubeRenderTarget===!0,ie=b.isWebGLMultipleRenderTargets===!0,ge=R(b)||a;if(Q){N.__webglFramebuffer=[];for(let se=0;se<6;se++)if(a&&x.mipmaps&&x.mipmaps.length>0){N.__webglFramebuffer[se]=[];for(let z=0;z<x.mipmaps.length;z++)N.__webglFramebuffer[se][z]=i.createFramebuffer()}else N.__webglFramebuffer[se]=i.createFramebuffer()}else{if(a&&x.mipmaps&&x.mipmaps.length>0){N.__webglFramebuffer=[];for(let se=0;se<x.mipmaps.length;se++)N.__webglFramebuffer[se]=i.createFramebuffer()}else N.__webglFramebuffer=i.createFramebuffer();if(ie)if(s.drawBuffers){let se=b.texture;for(let z=0,A=se.length;z<A;z++){let j=n.get(se[z]);j.__webglTexture===void 0&&(j.__webglTexture=i.createTexture(),o.memory.textures++)}}else console.warn("THREE.WebGLRenderer: WebGLMultipleRenderTargets can only be used with WebGL2 or WEBGL_draw_buffers extension.");if(a&&b.samples>0&&Ve(b)===!1){let se=ie?x:[x];N.__webglMultisampledFramebuffer=i.createFramebuffer(),N.__webglColorRenderbuffer=[],t.bindFramebuffer(i.FRAMEBUFFER,N.__webglMultisampledFramebuffer);for(let z=0;z<se.length;z++){let A=se[z];N.__webglColorRenderbuffer[z]=i.createRenderbuffer(),i.bindRenderbuffer(i.RENDERBUFFER,N.__webglColorRenderbuffer[z]);let j=r.convert(A.format,A.colorSpace),he=r.convert(A.type),ae=k(A.internalFormat,j,he,A.colorSpace,b.isXRRenderTarget===!0),ce=Re(b);i.renderbufferStorageMultisample(i.RENDERBUFFER,ce,ae,b.width,b.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+z,i.RENDERBUFFER,N.__webglColorRenderbuffer[z])}i.bindRenderbuffer(i.RENDERBUFFER,null),b.depthBuffer&&(N.__webglDepthRenderbuffer=i.createRenderbuffer(),D(N.__webglDepthRenderbuffer,b,!0)),t.bindFramebuffer(i.FRAMEBUFFER,null)}}if(Q){t.bindTexture(i.TEXTURE_CUBE_MAP,ne.__webglTexture),Ee(i.TEXTURE_CUBE_MAP,x,ge);for(let se=0;se<6;se++)if(a&&x.mipmaps&&x.mipmaps.length>0)for(let z=0;z<x.mipmaps.length;z++)Ce(N.__webglFramebuffer[se][z],b,x,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+se,z);else Ce(N.__webglFramebuffer[se],b,x,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+se,0);P(x,ge)&&T(i.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(ie){let se=b.texture;for(let z=0,A=se.length;z<A;z++){let j=se[z],he=n.get(j);t.bindTexture(i.TEXTURE_2D,he.__webglTexture),Ee(i.TEXTURE_2D,j,ge),Ce(N.__webglFramebuffer,b,j,i.COLOR_ATTACHMENT0+z,i.TEXTURE_2D,0),P(j,ge)&&T(i.TEXTURE_2D)}t.unbindTexture()}else{let se=i.TEXTURE_2D;if((b.isWebGL3DRenderTarget||b.isWebGLArrayRenderTarget)&&(a?se=b.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY:console.error("THREE.WebGLTextures: THREE.Data3DTexture and THREE.DataArrayTexture only supported with WebGL2.")),t.bindTexture(se,ne.__webglTexture),Ee(se,x,ge),a&&x.mipmaps&&x.mipmaps.length>0)for(let z=0;z<x.mipmaps.length;z++)Ce(N.__webglFramebuffer[z],b,x,i.COLOR_ATTACHMENT0,se,z);else Ce(N.__webglFramebuffer,b,x,i.COLOR_ATTACHMENT0,se,0);P(x,ge)&&T(se),t.unbindTexture()}b.depthBuffer&&xe(b)}function Ze(b){let x=R(b)||a,N=b.isWebGLMultipleRenderTargets===!0?b.texture:[b.texture];for(let ne=0,Q=N.length;ne<Q;ne++){let ie=N[ne];if(P(ie,x)){let ge=b.isWebGLCubeRenderTarget?i.TEXTURE_CUBE_MAP:i.TEXTURE_2D,se=n.get(ie).__webglTexture;t.bindTexture(ge,se),T(ge),t.unbindTexture()}}}function Ie(b){if(a&&b.samples>0&&Ve(b)===!1){let x=b.isWebGLMultipleRenderTargets?b.texture:[b.texture],N=b.width,ne=b.height,Q=i.COLOR_BUFFER_BIT,ie=[],ge=b.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,se=n.get(b),z=b.isWebGLMultipleRenderTargets===!0;if(z)for(let A=0;A<x.length;A++)t.bindFramebuffer(i.FRAMEBUFFER,se.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+A,i.RENDERBUFFER,null),t.bindFramebuffer(i.FRAMEBUFFER,se.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+A,i.TEXTURE_2D,null,0);t.bindFramebuffer(i.READ_FRAMEBUFFER,se.__webglMultisampledFramebuffer),t.bindFramebuffer(i.DRAW_FRAMEBUFFER,se.__webglFramebuffer);for(let A=0;A<x.length;A++){ie.push(i.COLOR_ATTACHMENT0+A),b.depthBuffer&&ie.push(ge);let j=se.__ignoreDepthValues!==void 0?se.__ignoreDepthValues:!1;if(j===!1&&(b.depthBuffer&&(Q|=i.DEPTH_BUFFER_BIT),b.stencilBuffer&&(Q|=i.STENCIL_BUFFER_BIT)),z&&i.framebufferRenderbuffer(i.READ_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.RENDERBUFFER,se.__webglColorRenderbuffer[A]),j===!0&&(i.invalidateFramebuffer(i.READ_FRAMEBUFFER,[ge]),i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,[ge])),z){let he=n.get(x[A]).__webglTexture;i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,he,0)}i.blitFramebuffer(0,0,N,ne,0,0,N,ne,Q,i.NEAREST),m&&i.invalidateFramebuffer(i.READ_FRAMEBUFFER,ie)}if(t.bindFramebuffer(i.READ_FRAMEBUFFER,null),t.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),z)for(let A=0;A<x.length;A++){t.bindFramebuffer(i.FRAMEBUFFER,se.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+A,i.RENDERBUFFER,se.__webglColorRenderbuffer[A]);let j=n.get(x[A]).__webglTexture;t.bindFramebuffer(i.FRAMEBUFFER,se.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+A,i.TEXTURE_2D,j,0)}t.bindFramebuffer(i.DRAW_FRAMEBUFFER,se.__webglMultisampledFramebuffer)}}function Re(b){return Math.min(d,b.samples)}function Ve(b){let x=n.get(b);return a&&b.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&x.__useRenderToTexture!==!1}function ot(b){let x=o.render.frame;g.get(b)!==x&&(g.set(b,x),b.update())}function ut(b,x){let N=b.colorSpace,ne=b.format,Q=b.type;return b.isCompressedTexture===!0||b.isVideoTexture===!0||b.format===ta||N!==sn&&N!==Gn&&(N===Xe||N===Ks?a===!1?e.has("EXT_sRGB")===!0&&ne===jt?(b.format=ta,b.minFilter=zt,b.generateMipmaps=!1):x=Os.sRGBToLinear(x):(ne!==jt||Q!==An)&&console.warn("THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):console.error("THREE.WebGLTextures: Unsupported texture color space:",N)),x}this.allocateTextureUnit=q,this.resetTextureUnits=X,this.setTexture2D=$,this.setTexture2DArray=O,this.setTexture3D=Y,this.setTextureCube=ue,this.rebindTextures=Ae,this.setupRenderTarget=be,this.updateRenderTargetMipmap=Ze,this.updateMultisampleRenderTarget=Ie,this.setupDepthRenderbuffer=xe,this.setupFrameBufferTexture=Ce,this.useMultisampledRTT=Ve}var Rp=0,lt=1;function Cp(i,e,t){let n=t.isWebGL2;function s(r,o=Gn){let a,l=o===Xe||o===Ks?lt:Rp;if(r===An)return i.UNSIGNED_BYTE;if(r===O0)return i.UNSIGNED_SHORT_4_4_4_4;if(r===N0)return i.UNSIGNED_SHORT_5_5_5_1;if(r===sc)return i.BYTE;if(r===rc)return i.SHORT;if(r===Ia)return i.UNSIGNED_SHORT;if(r===U0)return i.INT;if(r===En)return i.UNSIGNED_INT;if(r===tn)return i.FLOAT;if(r===Wn)return n?i.HALF_FLOAT:(a=e.get("OES_texture_half_float"),a!==null?a.HALF_FLOAT_OES:null);if(r===ac)return i.ALPHA;if(r===jt)return i.RGBA;if(r===oc)return i.LUMINANCE;if(r===lc)return i.LUMINANCE_ALPHA;if(r===Vn)return i.DEPTH_COMPONENT;if(r===wi)return i.DEPTH_STENCIL;if(r===ta)return a=e.get("EXT_sRGB"),a!==null?a.SRGB_ALPHA_EXT:null;if(r===cc)return i.RED;if(r===F0)return i.RED_INTEGER;if(r===hc)return i.RG;if(r===z0)return i.RG_INTEGER;if(r===B0)return i.RGBA_INTEGER;if(r===vr||r===Mr||r===br||r===Sr)if(l===lt)if(a=e.get("WEBGL_compressed_texture_s3tc_srgb"),a!==null){if(r===vr)return a.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(r===Mr)return a.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(r===br)return a.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(r===Sr)return a.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(a=e.get("WEBGL_compressed_texture_s3tc"),a!==null){if(r===vr)return a.COMPRESSED_RGB_S3TC_DXT1_EXT;if(r===Mr)return a.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(r===br)return a.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(r===Sr)return a.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(r===uo||r===fo||r===po||r===mo)if(a=e.get("WEBGL_compressed_texture_pvrtc"),a!==null){if(r===uo)return a.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(r===fo)return a.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(r===po)return a.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(r===mo)return a.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(r===uc)return a=e.get("WEBGL_compressed_texture_etc1"),a!==null?a.COMPRESSED_RGB_ETC1_WEBGL:null;if(r===go||r===_o)if(a=e.get("WEBGL_compressed_texture_etc"),a!==null){if(r===go)return l===lt?a.COMPRESSED_SRGB8_ETC2:a.COMPRESSED_RGB8_ETC2;if(r===_o)return l===lt?a.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:a.COMPRESSED_RGBA8_ETC2_EAC}else return null;if(r===xo||r===yo||r===vo||r===Mo||r===bo||r===So||r===wo||r===Eo||r===To||r===Ao||r===Ro||r===Co||r===Po||r===Lo)if(a=e.get("WEBGL_compressed_texture_astc"),a!==null){if(r===xo)return l===lt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:a.COMPRESSED_RGBA_ASTC_4x4_KHR;if(r===yo)return l===lt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:a.COMPRESSED_RGBA_ASTC_5x4_KHR;if(r===vo)return l===lt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:a.COMPRESSED_RGBA_ASTC_5x5_KHR;if(r===Mo)return l===lt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:a.COMPRESSED_RGBA_ASTC_6x5_KHR;if(r===bo)return l===lt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:a.COMPRESSED_RGBA_ASTC_6x6_KHR;if(r===So)return l===lt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:a.COMPRESSED_RGBA_ASTC_8x5_KHR;if(r===wo)return l===lt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:a.COMPRESSED_RGBA_ASTC_8x6_KHR;if(r===Eo)return l===lt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:a.COMPRESSED_RGBA_ASTC_8x8_KHR;if(r===To)return l===lt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:a.COMPRESSED_RGBA_ASTC_10x5_KHR;if(r===Ao)return l===lt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:a.COMPRESSED_RGBA_ASTC_10x6_KHR;if(r===Ro)return l===lt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:a.COMPRESSED_RGBA_ASTC_10x8_KHR;if(r===Co)return l===lt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:a.COMPRESSED_RGBA_ASTC_10x10_KHR;if(r===Po)return l===lt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:a.COMPRESSED_RGBA_ASTC_12x10_KHR;if(r===Lo)return l===lt?a.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:a.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(r===wr||r===Io||r===Do)if(a=e.get("EXT_texture_compression_bptc"),a!==null){if(r===wr)return l===lt?a.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:a.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(r===Io)return a.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(r===Do)return a.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(r===dc||r===Uo||r===Oo||r===No)if(a=e.get("EXT_texture_compression_rgtc"),a!==null){if(r===wr)return a.COMPRESSED_RED_RGTC1_EXT;if(r===Uo)return a.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(r===Oo)return a.COMPRESSED_RED_GREEN_RGTC2_EXT;if(r===No)return a.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return r===kn?n?i.UNSIGNED_INT_24_8:(a=e.get("WEBGL_depth_texture"),a!==null?a.UNSIGNED_INT_24_8_WEBGL:null):i[r]!==void 0?i[r]:null}return{convert:s}}var ga=class extends yt{constructor(e=[]){super(),this.isArrayCamera=!0,this.cameras=e}},Je=class extends Et{constructor(){super(),this.isGroup=!0,this.type="Group"}},Pp={type:"move"},Gi=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Je,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Je,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new L,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new L),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Je,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new L,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new L),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){let t=this._hand;if(t)for(let n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let s=null,r=null,o=null,a=this._targetRay,l=this._grip,c=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(c&&e.hand){o=!0;for(let _ of e.hand.values()){let p=t.getJointPose(_,n),u=this._getHandJoint(c,_);p!==null&&(u.matrix.fromArray(p.transform.matrix),u.matrix.decompose(u.position,u.rotation,u.scale),u.matrixWorldNeedsUpdate=!0,u.jointRadius=p.radius),u.visible=p!==null}let h=c.joints["index-finger-tip"],d=c.joints["thumb-tip"],f=h.position.distanceTo(d.position),m=.02,g=.005;c.inputState.pinching&&f>m+g?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!c.inputState.pinching&&f<=m-g&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else l!==null&&e.gripSpace&&(r=t.getPose(e.gripSpace,n),r!==null&&(l.matrix.fromArray(r.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,r.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(r.linearVelocity)):l.hasLinearVelocity=!1,r.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(r.angularVelocity)):l.hasAngularVelocity=!1));a!==null&&(s=t.getPose(e.targetRaySpace,n),s===null&&r!==null&&(s=r),s!==null&&(a.matrix.fromArray(s.transform.matrix),a.matrix.decompose(a.position,a.rotation,a.scale),a.matrixWorldNeedsUpdate=!0,s.linearVelocity?(a.hasLinearVelocity=!0,a.linearVelocity.copy(s.linearVelocity)):a.hasLinearVelocity=!1,s.angularVelocity?(a.hasAngularVelocity=!0,a.angularVelocity.copy(s.angularVelocity)):a.hasAngularVelocity=!1,this.dispatchEvent(Pp)))}return a!==null&&(a.visible=s!==null),l!==null&&(l.visible=r!==null),c!==null&&(c.visible=o!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){let n=new Je;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}},$i=class extends ft{constructor(e,t,n,s,r,o,a,l,c,h){if(h=h!==void 0?h:Vn,h!==Vn&&h!==wi)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");n===void 0&&h===Vn&&(n=En),n===void 0&&h===wi&&(n=kn),super(null,s,r,o,a,l,h,n,c),this.isDepthTexture=!0,this.image={width:e,height:t},this.magFilter=a!==void 0?a:He,this.minFilter=l!==void 0?l:He,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.compareFunction=e.compareFunction,this}toJSON(e){let t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}},_a=class extends rn{constructor(e,t){super();let n=this,s=null,r=1,o=null,a="local-floor",l=1,c=null,h=null,d=null,f=null,m=null,g=null,_=t.getContextAttributes(),p=null,u=null,S=[],y=[],R=new yt;R.layers.enable(1),R.viewport=new Ke;let w=new yt;w.layers.enable(2),w.viewport=new Ke;let P=[R,w],T=new ga;T.layers.enable(1),T.layers.enable(2);let k=null,v=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(O){let Y=S[O];return Y===void 0&&(Y=new Gi,S[O]=Y),Y.getTargetRaySpace()},this.getControllerGrip=function(O){let Y=S[O];return Y===void 0&&(Y=new Gi,S[O]=Y),Y.getGripSpace()},this.getHand=function(O){let Y=S[O];return Y===void 0&&(Y=new Gi,S[O]=Y),Y.getHandSpace()};function E(O){let Y=y.indexOf(O.inputSource);if(Y===-1)return;let ue=S[Y];ue!==void 0&&(ue.update(O.inputSource,O.frame,c||o),ue.dispatchEvent({type:O.type,data:O.inputSource}))}function Z(){s.removeEventListener("select",E),s.removeEventListener("selectstart",E),s.removeEventListener("selectend",E),s.removeEventListener("squeeze",E),s.removeEventListener("squeezestart",E),s.removeEventListener("squeezeend",E),s.removeEventListener("end",Z),s.removeEventListener("inputsourceschange",te);for(let O=0;O<S.length;O++){let Y=y[O];Y!==null&&(y[O]=null,S[O].disconnect(Y))}k=null,v=null,e.setRenderTarget(p),m=null,f=null,d=null,s=null,u=null,$.stop(),n.isPresenting=!1,n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(O){r=O,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(O){a=O,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||o},this.setReferenceSpace=function(O){c=O},this.getBaseLayer=function(){return f!==null?f:m},this.getBinding=function(){return d},this.getFrame=function(){return g},this.getSession=function(){return s},this.setSession=async function(O){if(s=O,s!==null){if(p=e.getRenderTarget(),s.addEventListener("select",E),s.addEventListener("selectstart",E),s.addEventListener("selectend",E),s.addEventListener("squeeze",E),s.addEventListener("squeezestart",E),s.addEventListener("squeezeend",E),s.addEventListener("end",Z),s.addEventListener("inputsourceschange",te),_.xrCompatible!==!0&&await t.makeXRCompatible(),s.renderState.layers===void 0||e.capabilities.isWebGL2===!1){let Y={antialias:s.renderState.layers===void 0?_.antialias:!0,alpha:!0,depth:_.depth,stencil:_.stencil,framebufferScaleFactor:r};m=new XRWebGLLayer(s,t,Y),s.updateRenderState({baseLayer:m}),u=new Ut(m.framebufferWidth,m.framebufferHeight,{format:jt,type:An,colorSpace:e.outputColorSpace,stencilBuffer:_.stencil})}else{let Y=null,ue=null,de=null;_.depth&&(de=_.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,Y=_.stencil?wi:Vn,ue=_.stencil?kn:En);let fe={colorFormat:t.RGBA8,depthFormat:de,scaleFactor:r};d=new XRWebGLBinding(s,t),f=d.createProjectionLayer(fe),s.updateRenderState({layers:[f]}),u=new Ut(f.textureWidth,f.textureHeight,{format:jt,type:An,depthTexture:new $i(f.textureWidth,f.textureHeight,ue,void 0,void 0,void 0,void 0,void 0,void 0,Y),stencilBuffer:_.stencil,colorSpace:e.outputColorSpace,samples:_.antialias?4:0});let ve=e.properties.get(u);ve.__ignoreDepthValues=f.ignoreDepthValues}u.isXRRenderTarget=!0,this.setFoveation(l),c=null,o=await s.requestReferenceSpace(a),$.setContext(s),$.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(s!==null)return s.environmentBlendMode};function te(O){for(let Y=0;Y<O.removed.length;Y++){let ue=O.removed[Y],de=y.indexOf(ue);de>=0&&(y[de]=null,S[de].disconnect(ue))}for(let Y=0;Y<O.added.length;Y++){let ue=O.added[Y],de=y.indexOf(ue);if(de===-1){for(let ve=0;ve<S.length;ve++)if(ve>=y.length){y.push(ue),de=ve;break}else if(y[ve]===null){y[ve]=ue,de=ve;break}if(de===-1)break}let fe=S[de];fe&&fe.connect(ue)}}let F=new L,H=new L;function V(O,Y,ue){F.setFromMatrixPosition(Y.matrixWorld),H.setFromMatrixPosition(ue.matrixWorld);let de=F.distanceTo(H),fe=Y.projectionMatrix.elements,ve=ue.projectionMatrix.elements,Ee=fe[14]/(fe[10]-1),_e=fe[14]/(fe[10]+1),ke=(fe[9]+1)/fe[5],pt=(fe[9]-1)/fe[5],Ce=(fe[8]-1)/fe[0],D=(ve[8]+1)/ve[0],at=Ee*Ce,xe=Ee*D,Ae=de/(-Ce+D),be=Ae*-Ce;Y.matrixWorld.decompose(O.position,O.quaternion,O.scale),O.translateX(be),O.translateZ(Ae),O.matrixWorld.compose(O.position,O.quaternion,O.scale),O.matrixWorldInverse.copy(O.matrixWorld).invert();let Ze=Ee+Ae,Ie=_e+Ae,Re=at-be,Ve=xe+(de-be),ot=ke*_e/Ie*Ze,ut=pt*_e/Ie*Ze;O.projectionMatrix.makePerspective(Re,Ve,ot,ut,Ze,Ie),O.projectionMatrixInverse.copy(O.projectionMatrix).invert()}function K(O,Y){Y===null?O.matrixWorld.copy(O.matrix):O.matrixWorld.multiplyMatrices(Y.matrixWorld,O.matrix),O.matrixWorldInverse.copy(O.matrixWorld).invert()}this.updateCamera=function(O){if(s===null)return;T.near=w.near=R.near=O.near,T.far=w.far=R.far=O.far,(k!==T.near||v!==T.far)&&(s.updateRenderState({depthNear:T.near,depthFar:T.far}),k=T.near,v=T.far);let Y=O.parent,ue=T.cameras;K(T,Y);for(let de=0;de<ue.length;de++)K(ue[de],Y);ue.length===2?V(T,R,w):T.projectionMatrix.copy(R.projectionMatrix),X(O,T,Y)};function X(O,Y,ue){ue===null?O.matrix.copy(Y.matrixWorld):(O.matrix.copy(ue.matrixWorld),O.matrix.invert(),O.matrix.multiply(Y.matrixWorld)),O.matrix.decompose(O.position,O.quaternion,O.scale),O.updateMatrixWorld(!0),O.projectionMatrix.copy(Y.projectionMatrix),O.projectionMatrixInverse.copy(Y.projectionMatrixInverse),O.isPerspectiveCamera&&(O.fov=qi*2*Math.atan(1/O.projectionMatrix.elements[5]),O.zoom=1)}this.getCamera=function(){return T},this.getFoveation=function(){if(!(f===null&&m===null))return l},this.setFoveation=function(O){l=O,f!==null&&(f.fixedFoveation=O),m!==null&&m.fixedFoveation!==void 0&&(m.fixedFoveation=O)};let q=null;function J(O,Y){if(h=Y.getViewerPose(c||o),g=Y,h!==null){let ue=h.views;m!==null&&(e.setRenderTargetFramebuffer(u,m.framebuffer),e.setRenderTarget(u));let de=!1;ue.length!==T.cameras.length&&(T.cameras.length=0,de=!0);for(let fe=0;fe<ue.length;fe++){let ve=ue[fe],Ee=null;if(m!==null)Ee=m.getViewport(ve);else{let ke=d.getViewSubImage(f,ve);Ee=ke.viewport,fe===0&&(e.setRenderTargetTextures(u,ke.colorTexture,f.ignoreDepthValues?void 0:ke.depthStencilTexture),e.setRenderTarget(u))}let _e=P[fe];_e===void 0&&(_e=new yt,_e.layers.enable(fe),_e.viewport=new Ke,P[fe]=_e),_e.matrix.fromArray(ve.transform.matrix),_e.matrix.decompose(_e.position,_e.quaternion,_e.scale),_e.projectionMatrix.fromArray(ve.projectionMatrix),_e.projectionMatrixInverse.copy(_e.projectionMatrix).invert(),_e.viewport.set(Ee.x,Ee.y,Ee.width,Ee.height),fe===0&&(T.matrix.copy(_e.matrix),T.matrix.decompose(T.position,T.quaternion,T.scale)),de===!0&&T.cameras.push(_e)}}for(let ue=0;ue<S.length;ue++){let de=y[ue],fe=S[ue];de!==null&&fe!==void 0&&fe.update(de,Y,c||o)}q&&q(O,Y),Y.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:Y}),g=null}let $=new q0;$.setAnimationLoop(J),this.setAnimationLoop=function(O){q=O},this.dispose=function(){}}};function Lp(i,e){function t(p,u){p.matrixAutoUpdate===!0&&p.updateMatrix(),u.value.copy(p.matrix)}function n(p,u){u.color.getRGB(p.fogColor.value,X0(i)),u.isFog?(p.fogNear.value=u.near,p.fogFar.value=u.far):u.isFogExp2&&(p.fogDensity.value=u.density)}function s(p,u,S,y,R){u.isMeshBasicMaterial||u.isMeshLambertMaterial?r(p,u):u.isMeshToonMaterial?(r(p,u),d(p,u)):u.isMeshPhongMaterial?(r(p,u),h(p,u)):u.isMeshStandardMaterial?(r(p,u),f(p,u),u.isMeshPhysicalMaterial&&m(p,u,R)):u.isMeshMatcapMaterial?(r(p,u),g(p,u)):u.isMeshDepthMaterial?r(p,u):u.isMeshDistanceMaterial?(r(p,u),_(p,u)):u.isMeshNormalMaterial?r(p,u):u.isLineBasicMaterial?(o(p,u),u.isLineDashedMaterial&&a(p,u)):u.isPointsMaterial?l(p,u,S,y):u.isSpriteMaterial?c(p,u):u.isShadowMaterial?(p.color.value.copy(u.color),p.opacity.value=u.opacity):u.isShaderMaterial&&(u.uniformsNeedUpdate=!1)}function r(p,u){p.opacity.value=u.opacity,u.color&&p.diffuse.value.copy(u.color),u.emissive&&p.emissive.value.copy(u.emissive).multiplyScalar(u.emissiveIntensity),u.map&&(p.map.value=u.map,t(u.map,p.mapTransform)),u.alphaMap&&(p.alphaMap.value=u.alphaMap,t(u.alphaMap,p.alphaMapTransform)),u.bumpMap&&(p.bumpMap.value=u.bumpMap,t(u.bumpMap,p.bumpMapTransform),p.bumpScale.value=u.bumpScale,u.side===Tt&&(p.bumpScale.value*=-1)),u.normalMap&&(p.normalMap.value=u.normalMap,t(u.normalMap,p.normalMapTransform),p.normalScale.value.copy(u.normalScale),u.side===Tt&&p.normalScale.value.negate()),u.displacementMap&&(p.displacementMap.value=u.displacementMap,t(u.displacementMap,p.displacementMapTransform),p.displacementScale.value=u.displacementScale,p.displacementBias.value=u.displacementBias),u.emissiveMap&&(p.emissiveMap.value=u.emissiveMap,t(u.emissiveMap,p.emissiveMapTransform)),u.specularMap&&(p.specularMap.value=u.specularMap,t(u.specularMap,p.specularMapTransform)),u.alphaTest>0&&(p.alphaTest.value=u.alphaTest);let S=e.get(u).envMap;if(S&&(p.envMap.value=S,p.flipEnvMap.value=S.isCubeTexture&&S.isRenderTargetTexture===!1?-1:1,p.reflectivity.value=u.reflectivity,p.ior.value=u.ior,p.refractionRatio.value=u.refractionRatio),u.lightMap){p.lightMap.value=u.lightMap;let y=i._useLegacyLights===!0?Math.PI:1;p.lightMapIntensity.value=u.lightMapIntensity*y,t(u.lightMap,p.lightMapTransform)}u.aoMap&&(p.aoMap.value=u.aoMap,p.aoMapIntensity.value=u.aoMapIntensity,t(u.aoMap,p.aoMapTransform))}function o(p,u){p.diffuse.value.copy(u.color),p.opacity.value=u.opacity,u.map&&(p.map.value=u.map,t(u.map,p.mapTransform))}function a(p,u){p.dashSize.value=u.dashSize,p.totalSize.value=u.dashSize+u.gapSize,p.scale.value=u.scale}function l(p,u,S,y){p.diffuse.value.copy(u.color),p.opacity.value=u.opacity,p.size.value=u.size*S,p.scale.value=y*.5,u.map&&(p.map.value=u.map,t(u.map,p.uvTransform)),u.alphaMap&&(p.alphaMap.value=u.alphaMap,t(u.alphaMap,p.alphaMapTransform)),u.alphaTest>0&&(p.alphaTest.value=u.alphaTest)}function c(p,u){p.diffuse.value.copy(u.color),p.opacity.value=u.opacity,p.rotation.value=u.rotation,u.map&&(p.map.value=u.map,t(u.map,p.mapTransform)),u.alphaMap&&(p.alphaMap.value=u.alphaMap,t(u.alphaMap,p.alphaMapTransform)),u.alphaTest>0&&(p.alphaTest.value=u.alphaTest)}function h(p,u){p.specular.value.copy(u.specular),p.shininess.value=Math.max(u.shininess,1e-4)}function d(p,u){u.gradientMap&&(p.gradientMap.value=u.gradientMap)}function f(p,u){p.metalness.value=u.metalness,u.metalnessMap&&(p.metalnessMap.value=u.metalnessMap,t(u.metalnessMap,p.metalnessMapTransform)),p.roughness.value=u.roughness,u.roughnessMap&&(p.roughnessMap.value=u.roughnessMap,t(u.roughnessMap,p.roughnessMapTransform)),e.get(u).envMap&&(p.envMapIntensity.value=u.envMapIntensity)}function m(p,u,S){p.ior.value=u.ior,u.sheen>0&&(p.sheenColor.value.copy(u.sheenColor).multiplyScalar(u.sheen),p.sheenRoughness.value=u.sheenRoughness,u.sheenColorMap&&(p.sheenColorMap.value=u.sheenColorMap,t(u.sheenColorMap,p.sheenColorMapTransform)),u.sheenRoughnessMap&&(p.sheenRoughnessMap.value=u.sheenRoughnessMap,t(u.sheenRoughnessMap,p.sheenRoughnessMapTransform))),u.clearcoat>0&&(p.clearcoat.value=u.clearcoat,p.clearcoatRoughness.value=u.clearcoatRoughness,u.clearcoatMap&&(p.clearcoatMap.value=u.clearcoatMap,t(u.clearcoatMap,p.clearcoatMapTransform)),u.clearcoatRoughnessMap&&(p.clearcoatRoughnessMap.value=u.clearcoatRoughnessMap,t(u.clearcoatRoughnessMap,p.clearcoatRoughnessMapTransform)),u.clearcoatNormalMap&&(p.clearcoatNormalMap.value=u.clearcoatNormalMap,t(u.clearcoatNormalMap,p.clearcoatNormalMapTransform),p.clearcoatNormalScale.value.copy(u.clearcoatNormalScale),u.side===Tt&&p.clearcoatNormalScale.value.negate())),u.iridescence>0&&(p.iridescence.value=u.iridescence,p.iridescenceIOR.value=u.iridescenceIOR,p.iridescenceThicknessMinimum.value=u.iridescenceThicknessRange[0],p.iridescenceThicknessMaximum.value=u.iridescenceThicknessRange[1],u.iridescenceMap&&(p.iridescenceMap.value=u.iridescenceMap,t(u.iridescenceMap,p.iridescenceMapTransform)),u.iridescenceThicknessMap&&(p.iridescenceThicknessMap.value=u.iridescenceThicknessMap,t(u.iridescenceThicknessMap,p.iridescenceThicknessMapTransform))),u.transmission>0&&(p.transmission.value=u.transmission,p.transmissionSamplerMap.value=S.texture,p.transmissionSamplerSize.value.set(S.width,S.height),u.transmissionMap&&(p.transmissionMap.value=u.transmissionMap,t(u.transmissionMap,p.transmissionMapTransform)),p.thickness.value=u.thickness,u.thicknessMap&&(p.thicknessMap.value=u.thicknessMap,t(u.thicknessMap,p.thicknessMapTransform)),p.attenuationDistance.value=u.attenuationDistance,p.attenuationColor.value.copy(u.attenuationColor)),u.anisotropy>0&&(p.anisotropyVector.value.set(u.anisotropy*Math.cos(u.anisotropyRotation),u.anisotropy*Math.sin(u.anisotropyRotation)),u.anisotropyMap&&(p.anisotropyMap.value=u.anisotropyMap,t(u.anisotropyMap,p.anisotropyMapTransform))),p.specularIntensity.value=u.specularIntensity,p.specularColor.value.copy(u.specularColor),u.specularColorMap&&(p.specularColorMap.value=u.specularColorMap,t(u.specularColorMap,p.specularColorMapTransform)),u.specularIntensityMap&&(p.specularIntensityMap.value=u.specularIntensityMap,t(u.specularIntensityMap,p.specularIntensityMapTransform))}function g(p,u){u.matcap&&(p.matcap.value=u.matcap)}function _(p,u){let S=e.get(u).light;p.referencePosition.value.setFromMatrixPosition(S.matrixWorld),p.nearDistance.value=S.shadow.camera.near,p.farDistance.value=S.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:s}}function Ip(i,e,t,n){let s={},r={},o=[],a=t.isWebGL2?i.getParameter(i.MAX_UNIFORM_BUFFER_BINDINGS):0;function l(S,y){let R=y.program;n.uniformBlockBinding(S,R)}function c(S,y){let R=s[S.id];R===void 0&&(g(S),R=h(S),s[S.id]=R,S.addEventListener("dispose",p));let w=y.program;n.updateUBOMapping(S,w);let P=e.render.frame;r[S.id]!==P&&(f(S),r[S.id]=P)}function h(S){let y=d();S.__bindingPointIndex=y;let R=i.createBuffer(),w=S.__size,P=S.usage;return i.bindBuffer(i.UNIFORM_BUFFER,R),i.bufferData(i.UNIFORM_BUFFER,w,P),i.bindBuffer(i.UNIFORM_BUFFER,null),i.bindBufferBase(i.UNIFORM_BUFFER,y,R),R}function d(){for(let S=0;S<a;S++)if(o.indexOf(S)===-1)return o.push(S),S;return console.error("THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function f(S){let y=s[S.id],R=S.uniforms,w=S.__cache;i.bindBuffer(i.UNIFORM_BUFFER,y);for(let P=0,T=R.length;P<T;P++){let k=R[P];if(m(k,P,w)===!0){let v=k.__offset,E=Array.isArray(k.value)?k.value:[k.value],Z=0;for(let te=0;te<E.length;te++){let F=E[te],H=_(F);typeof F=="number"?(k.__data[0]=F,i.bufferSubData(i.UNIFORM_BUFFER,v+Z,k.__data)):F.isMatrix3?(k.__data[0]=F.elements[0],k.__data[1]=F.elements[1],k.__data[2]=F.elements[2],k.__data[3]=F.elements[0],k.__data[4]=F.elements[3],k.__data[5]=F.elements[4],k.__data[6]=F.elements[5],k.__data[7]=F.elements[0],k.__data[8]=F.elements[6],k.__data[9]=F.elements[7],k.__data[10]=F.elements[8],k.__data[11]=F.elements[0]):(F.toArray(k.__data,Z),Z+=H.storage/Float32Array.BYTES_PER_ELEMENT)}i.bufferSubData(i.UNIFORM_BUFFER,v,k.__data)}}i.bindBuffer(i.UNIFORM_BUFFER,null)}function m(S,y,R){let w=S.value;if(R[y]===void 0){if(typeof w=="number")R[y]=w;else{let P=Array.isArray(w)?w:[w],T=[];for(let k=0;k<P.length;k++)T.push(P[k].clone());R[y]=T}return!0}else if(typeof w=="number"){if(R[y]!==w)return R[y]=w,!0}else{let P=Array.isArray(R[y])?R[y]:[R[y]],T=Array.isArray(w)?w:[w];for(let k=0;k<P.length;k++){let v=P[k];if(v.equals(T[k])===!1)return v.copy(T[k]),!0}}return!1}function g(S){let y=S.uniforms,R=0,w=16,P=0;for(let T=0,k=y.length;T<k;T++){let v=y[T],E={boundary:0,storage:0},Z=Array.isArray(v.value)?v.value:[v.value];for(let te=0,F=Z.length;te<F;te++){let H=Z[te],V=_(H);E.boundary+=V.boundary,E.storage+=V.storage}if(v.__data=new Float32Array(E.storage/Float32Array.BYTES_PER_ELEMENT),v.__offset=R,T>0){P=R%w;let te=w-P;P!==0&&te-E.boundary<0&&(R+=w-P,v.__offset=R)}R+=E.storage}return P=R%w,P>0&&(R+=w-P),S.__size=R,S.__cache={},this}function _(S){let y={boundary:0,storage:0};return typeof S=="number"?(y.boundary=4,y.storage=4):S.isVector2?(y.boundary=8,y.storage=8):S.isVector3||S.isColor?(y.boundary=16,y.storage=12):S.isVector4?(y.boundary=16,y.storage=16):S.isMatrix3?(y.boundary=48,y.storage=48):S.isMatrix4?(y.boundary=64,y.storage=64):S.isTexture?console.warn("THREE.WebGLRenderer: Texture samplers can not be part of an uniforms group."):console.warn("THREE.WebGLRenderer: Unsupported uniform value type.",S),y}function p(S){let y=S.target;y.removeEventListener("dispose",p);let R=o.indexOf(y.__bindingPointIndex);o.splice(R,1),i.deleteBuffer(s[y.id]),delete s[y.id],delete r[y.id]}function u(){for(let S in s)i.deleteBuffer(s[S]);o=[],s={},r={}}return{bind:l,update:c,dispose:u}}var Ki=class{constructor(e={}){let{canvas:t=Bc(),context:n=null,depth:s=!0,stencil:r=!0,alpha:o=!1,antialias:a=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:d=!1}=e;this.isWebGLRenderer=!0;let f;n!==null?f=n.getContextAttributes().alpha:f=o;let m=new Uint32Array(4),g=new Int32Array(4),_=null,p=null,u=[],S=[];this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.outputColorSpace=Xe,this._useLegacyLights=!1,this.toneMapping=Tn,this.toneMappingExposure=1;let y=this,R=!1,w=0,P=0,T=null,k=-1,v=null,E=new Ke,Z=new Ke,te=null,F=new ze(0),H=0,V=t.width,K=t.height,X=1,q=null,J=null,$=new Ke(0,0,V,K),O=new Ke(0,0,V,K),Y=!1,ue=new ji,de=!1,fe=!1,ve=null,Ee=new rt,_e=new me,ke=new L,pt={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};function Ce(){return T===null?X:1}let D=n;function at(M,I){for(let G=0;G<M.length;G++){let U=M[G],W=t.getContext(U,I);if(W!==null)return W}return null}try{let M={alpha:!0,depth:s,stencil:r,antialias:a,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:h,failIfMajorPerformanceCaveat:d};if("setAttribute"in t&&t.setAttribute("data-engine","three.js r156"),t.addEventListener("webglcontextlost",le,!1),t.addEventListener("webglcontextrestored",B,!1),t.addEventListener("webglcontextcreationerror",ee,!1),D===null){let I=["webgl2","webgl","experimental-webgl"];if(y.isWebGL1Renderer===!0&&I.shift(),D=at(I,M),D===null)throw at(I)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}typeof WebGLRenderingContext<"u"&&D instanceof WebGLRenderingContext&&console.warn("THREE.WebGLRenderer: WebGL 1 support was deprecated in r153 and will be removed in r163."),D.getShaderPrecisionFormat===void 0&&(D.getShaderPrecisionFormat=function(){return{rangeMin:1,rangeMax:1,precision:1}})}catch(M){throw console.error("THREE.WebGLRenderer: "+M.message),M}let xe,Ae,be,Ze,Ie,Re,Ve,ot,ut,b,x,N,ne,Q,ie,ge,se,z,A,j,he,ae,ce,Te;function Be(){xe=new $d(D),Ae=new Xd(D,xe,e),xe.init(Ae),ae=new Cp(D,xe,Ae),be=new Tp(D,xe,Ae),Ze=new ef(D),Ie=new pp,Re=new Ap(D,xe,be,Ie,Ae,ae,Ze),Ve=new Yd(y),ot=new Jd(y),ut=new hh(D,Ae),ce=new Gd(D,xe,ut,Ae),b=new Kd(D,ut,Ze,ce),x=new rf(D,b,ut,Ze),A=new sf(D,Ae,Re),ge=new qd(Ie),N=new fp(y,Ve,ot,xe,Ae,ce,ge),ne=new Lp(y,Ie),Q=new gp,ie=new bp(xe,Ae),z=new Hd(y,Ve,ot,be,x,f,l),se=new Ep(y,x,Ae),Te=new Ip(D,Ze,Ae,be),j=new Wd(D,xe,Ze,Ae),he=new Qd(D,xe,Ze,Ae),Ze.programs=N.programs,y.capabilities=Ae,y.extensions=xe,y.properties=Ie,y.renderLists=Q,y.shadowMap=se,y.state=be,y.info=Ze}Be();let C=new _a(y,D);this.xr=C,this.getContext=function(){return D},this.getContextAttributes=function(){return D.getContextAttributes()},this.forceContextLoss=function(){let M=xe.get("WEBGL_lose_context");M&&M.loseContext()},this.forceContextRestore=function(){let M=xe.get("WEBGL_lose_context");M&&M.restoreContext()},this.getPixelRatio=function(){return X},this.setPixelRatio=function(M){M!==void 0&&(X=M,this.setSize(V,K,!1))},this.getSize=function(M){return M.set(V,K)},this.setSize=function(M,I,G=!0){if(C.isPresenting){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}V=M,K=I,t.width=Math.floor(M*X),t.height=Math.floor(I*X),G===!0&&(t.style.width=M+"px",t.style.height=I+"px"),this.setViewport(0,0,M,I)},this.getDrawingBufferSize=function(M){return M.set(V*X,K*X).floor()},this.setDrawingBufferSize=function(M,I,G){V=M,K=I,X=G,t.width=Math.floor(M*G),t.height=Math.floor(I*G),this.setViewport(0,0,M,I)},this.getCurrentViewport=function(M){return M.copy(E)},this.getViewport=function(M){return M.copy($)},this.setViewport=function(M,I,G,U){M.isVector4?$.set(M.x,M.y,M.z,M.w):$.set(M,I,G,U),be.viewport(E.copy($).multiplyScalar(X).floor())},this.getScissor=function(M){return M.copy(O)},this.setScissor=function(M,I,G,U){M.isVector4?O.set(M.x,M.y,M.z,M.w):O.set(M,I,G,U),be.scissor(Z.copy(O).multiplyScalar(X).floor())},this.getScissorTest=function(){return Y},this.setScissorTest=function(M){be.setScissorTest(Y=M)},this.setOpaqueSort=function(M){q=M},this.setTransparentSort=function(M){J=M},this.getClearColor=function(M){return M.copy(z.getClearColor())},this.setClearColor=function(){z.setClearColor.apply(z,arguments)},this.getClearAlpha=function(){return z.getClearAlpha()},this.setClearAlpha=function(){z.setClearAlpha.apply(z,arguments)},this.clear=function(M=!0,I=!0,G=!0){let U=0;if(M){let W=!1;if(T!==null){let pe=T.texture.format;W=pe===B0||pe===z0||pe===F0}if(W){let pe=T.texture.type,ye=pe===An||pe===En||pe===Ia||pe===kn||pe===O0||pe===N0,Se=z.getClearColor(),we=z.getClearAlpha(),Ne=Se.r,Me=Se.g,Pe=Se.b;ye?(m[0]=Ne,m[1]=Me,m[2]=Pe,m[3]=we,D.clearBufferuiv(D.COLOR,0,m)):(g[0]=Ne,g[1]=Me,g[2]=Pe,g[3]=we,D.clearBufferiv(D.COLOR,0,g))}else U|=D.COLOR_BUFFER_BIT}I&&(U|=D.DEPTH_BUFFER_BIT),G&&(U|=D.STENCIL_BUFFER_BIT),D.clear(U)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){t.removeEventListener("webglcontextlost",le,!1),t.removeEventListener("webglcontextrestored",B,!1),t.removeEventListener("webglcontextcreationerror",ee,!1),Q.dispose(),ie.dispose(),Ie.dispose(),Ve.dispose(),ot.dispose(),x.dispose(),ce.dispose(),Te.dispose(),N.dispose(),C.dispose(),C.removeEventListener("sessionstart",je),C.removeEventListener("sessionend",Kt),ve&&(ve.dispose(),ve=null),Mt.stop()};function le(M){M.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),R=!0}function B(){console.log("THREE.WebGLRenderer: Context Restored."),R=!1;let M=Ze.autoReset,I=se.enabled,G=se.autoUpdate,U=se.needsUpdate,W=se.type;Be(),Ze.autoReset=M,se.enabled=I,se.autoUpdate=G,se.needsUpdate=U,se.type=W}function ee(M){console.error("THREE.WebGLRenderer: A WebGL context could not be created. Reason: ",M.statusMessage)}function re(M){let I=M.target;I.removeEventListener("dispose",re),Oe(I)}function Oe(M){We(M),Ie.remove(M)}function We(M){let I=Ie.get(M).programs;I!==void 0&&(I.forEach(function(G){N.releaseProgram(G)}),M.isShaderMaterial&&N.releaseShaderCache(M))}this.renderBufferDirect=function(M,I,G,U,W,pe){I===null&&(I=pt);let ye=W.isMesh&&W.matrixWorld.determinant()<0,Se=wl(M,I,G,U,W);be.setMaterial(U,ye);let we=G.index,Ne=1;if(U.wireframe===!0){if(we=b.getWireframeAttribute(G),we===void 0)return;Ne=2}let Me=G.drawRange,Pe=G.attributes.position,Qe=Me.start*Ne,tt=(Me.start+Me.count)*Ne;pe!==null&&(Qe=Math.max(Qe,pe.start*Ne),tt=Math.min(tt,(pe.start+pe.count)*Ne)),we!==null?(Qe=Math.max(Qe,0),tt=Math.min(tt,we.count)):Pe!=null&&(Qe=Math.max(Qe,0),tt=Math.min(tt,Pe.count));let Nt=tt-Qe;if(Nt<0||Nt===1/0)return;ce.setup(W,U,Se,G,we);let ln,nt=j;if(we!==null&&(ln=ut.get(we),nt=he,nt.setIndex(ln)),W.isMesh)U.wireframe===!0?(be.setLineWidth(U.wireframeLinewidth*Ce()),nt.setMode(D.LINES)):nt.setMode(D.TRIANGLES);else if(W.isLine){let Fe=U.linewidth;Fe===void 0&&(Fe=1),be.setLineWidth(Fe*Ce()),W.isLineSegments?nt.setMode(D.LINES):W.isLineLoop?nt.setMode(D.LINE_LOOP):nt.setMode(D.LINE_STRIP)}else W.isPoints?nt.setMode(D.POINTS):W.isSprite&&nt.setMode(D.TRIANGLES);if(W.isInstancedMesh)nt.renderInstances(Qe,Nt,W.count);else if(G.isInstancedBufferGeometry){let Fe=G._maxInstanceCount!==void 0?G._maxInstanceCount:1/0,mr=Math.min(G.instanceCount,Fe);nt.renderInstances(Qe,Nt,mr)}else nt.render(Qe,Nt)},this.compile=function(M,I){function G(U,W,pe){U.transparent===!0&&U.side===vt&&U.forceSinglePass===!1?(U.side=Tt,U.needsUpdate=!0,rs(U,W,pe),U.side=Dt,U.needsUpdate=!0,rs(U,W,pe),U.side=vt):rs(U,W,pe)}p=ie.get(M),p.init(),S.push(p),M.traverseVisible(function(U){U.isLight&&U.layers.test(I.layers)&&(p.pushLight(U),U.castShadow&&p.pushShadow(U))}),p.setupLights(y._useLegacyLights),M.traverse(function(U){let W=U.material;if(W)if(Array.isArray(W))for(let pe=0;pe<W.length;pe++){let ye=W[pe];G(ye,M,U)}else G(W,M,U)}),S.pop(),p=null};let Ye=null;function At(M){Ye&&Ye(M)}function je(){Mt.stop()}function Kt(){Mt.start()}let Mt=new q0;Mt.setAnimationLoop(At),typeof self<"u"&&Mt.setContext(self),this.setAnimationLoop=function(M){Ye=M,C.setAnimationLoop(M),M===null?Mt.stop():Mt.start()},C.addEventListener("sessionstart",je),C.addEventListener("sessionend",Kt),this.render=function(M,I){if(I!==void 0&&I.isCamera!==!0){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(R===!0)return;M.matrixWorldAutoUpdate===!0&&M.updateMatrixWorld(),I.parent===null&&I.matrixWorldAutoUpdate===!0&&I.updateMatrixWorld(),C.enabled===!0&&C.isPresenting===!0&&(C.cameraAutoUpdate===!0&&C.updateCamera(I),I=C.getCamera()),M.isScene===!0&&M.onBeforeRender(y,M,I,T),p=ie.get(M,S.length),p.init(),S.push(p),Ee.multiplyMatrices(I.projectionMatrix,I.matrixWorldInverse),ue.setFromProjectionMatrix(Ee),fe=this.localClippingEnabled,de=ge.init(this.clippingPlanes,fe),_=Q.get(M,u.length),_.init(),u.push(_),Ka(M,I,0,y.sortObjects),_.finish(),y.sortObjects===!0&&_.sort(q,J),this.info.render.frame++,de===!0&&ge.beginShadows();let G=p.state.shadowsArray;if(se.render(G,M,I),de===!0&&ge.endShadows(),this.info.autoReset===!0&&this.info.reset(),z.render(_,M),p.setupLights(y._useLegacyLights),I.isArrayCamera){let U=I.cameras;for(let W=0,pe=U.length;W<pe;W++){let ye=U[W];Qa(_,M,ye,ye.viewport)}}else Qa(_,M,I);T!==null&&(Re.updateMultisampleRenderTarget(T),Re.updateRenderTargetMipmap(T)),M.isScene===!0&&M.onAfterRender(y,M,I),ce.resetDefaultState(),k=-1,v=null,S.pop(),S.length>0?p=S[S.length-1]:p=null,u.pop(),u.length>0?_=u[u.length-1]:_=null};function Ka(M,I,G,U){if(M.visible===!1)return;if(M.layers.test(I.layers)){if(M.isGroup)G=M.renderOrder;else if(M.isLOD)M.autoUpdate===!0&&M.update(I);else if(M.isLight)p.pushLight(M),M.castShadow&&p.pushShadow(M);else if(M.isSprite){if(!M.frustumCulled||ue.intersectsSprite(M)){U&&ke.setFromMatrixPosition(M.matrixWorld).applyMatrix4(Ee);let ye=x.update(M),Se=M.material;Se.visible&&_.push(M,ye,Se,G,ke.z,null)}}else if((M.isMesh||M.isLine||M.isPoints)&&(!M.frustumCulled||ue.intersectsObject(M))){let ye=x.update(M),Se=M.material;if(U&&(M.boundingSphere!==void 0?(M.boundingSphere===null&&M.computeBoundingSphere(),ke.copy(M.boundingSphere.center)):(ye.boundingSphere===null&&ye.computeBoundingSphere(),ke.copy(ye.boundingSphere.center)),ke.applyMatrix4(M.matrixWorld).applyMatrix4(Ee)),Array.isArray(Se)){let we=ye.groups;for(let Ne=0,Me=we.length;Ne<Me;Ne++){let Pe=we[Ne],Qe=Se[Pe.materialIndex];Qe&&Qe.visible&&_.push(M,ye,Qe,G,ke.z,Pe)}}else Se.visible&&_.push(M,ye,Se,G,ke.z,null)}}let pe=M.children;for(let ye=0,Se=pe.length;ye<Se;ye++)Ka(pe[ye],I,G,U)}function Qa(M,I,G,U){let W=M.opaque,pe=M.transmissive,ye=M.transparent;p.setupLightsView(G),de===!0&&ge.setGlobalState(y.clippingPlanes,G),pe.length>0&&Sl(W,pe,I,G),U&&be.viewport(E.copy(U)),W.length>0&&ss(W,I,G),pe.length>0&&ss(pe,I,G),ye.length>0&&ss(ye,I,G),be.buffers.depth.setTest(!0),be.buffers.depth.setMask(!0),be.buffers.color.setMask(!0),be.setPolygonOffset(!1)}function Sl(M,I,G,U){let W=Ae.isWebGL2;ve===null&&(ve=new Ut(1,1,{generateMipmaps:!0,type:xe.has("EXT_color_buffer_half_float")?Wn:An,minFilter:Xi,samples:W?4:0})),y.getDrawingBufferSize(_e),W?ve.setSize(_e.x,_e.y):ve.setSize(Ds(_e.x),Ds(_e.y));let pe=y.getRenderTarget();y.setRenderTarget(ve),y.getClearColor(F),H=y.getClearAlpha(),H<1&&y.setClearColor(16777215,.5),y.clear();let ye=y.toneMapping;y.toneMapping=Tn,ss(M,G,U),Re.updateMultisampleRenderTarget(ve),Re.updateRenderTargetMipmap(ve);let Se=!1;for(let we=0,Ne=I.length;we<Ne;we++){let Me=I[we],Pe=Me.object,Qe=Me.geometry,tt=Me.material,Nt=Me.group;if(tt.side===vt&&Pe.layers.test(U.layers)){let ln=tt.side;tt.side=Tt,tt.needsUpdate=!0,eo(Pe,G,U,Qe,tt,Nt),tt.side=ln,tt.needsUpdate=!0,Se=!0}}Se===!0&&(Re.updateMultisampleRenderTarget(ve),Re.updateRenderTargetMipmap(ve)),y.setRenderTarget(pe),y.setClearColor(F,H),y.toneMapping=ye}function ss(M,I,G){let U=I.isScene===!0?I.overrideMaterial:null;for(let W=0,pe=M.length;W<pe;W++){let ye=M[W],Se=ye.object,we=ye.geometry,Ne=U===null?ye.material:U,Me=ye.group;Se.layers.test(G.layers)&&eo(Se,I,G,we,Ne,Me)}}function eo(M,I,G,U,W,pe){M.onBeforeRender(y,I,G,U,W,pe),M.modelViewMatrix.multiplyMatrices(G.matrixWorldInverse,M.matrixWorld),M.normalMatrix.getNormalMatrix(M.modelViewMatrix),W.onBeforeRender(y,I,G,U,M,pe),W.transparent===!0&&W.side===vt&&W.forceSinglePass===!1?(W.side=Tt,W.needsUpdate=!0,y.renderBufferDirect(G,I,U,W,M,pe),W.side=Dt,W.needsUpdate=!0,y.renderBufferDirect(G,I,U,W,M,pe),W.side=vt):y.renderBufferDirect(G,I,U,W,M,pe),M.onAfterRender(y,I,G,U,W,pe)}function rs(M,I,G){I.isScene!==!0&&(I=pt);let U=Ie.get(M),W=p.state.lights,pe=p.state.shadowsArray,ye=W.state.version,Se=N.getParameters(M,W.state,pe,I,G),we=N.getProgramCacheKey(Se),Ne=U.programs;U.environment=M.isMeshStandardMaterial?I.environment:null,U.fog=I.fog,U.envMap=(M.isMeshStandardMaterial?ot:Ve).get(M.envMap||U.environment),Ne===void 0&&(M.addEventListener("dispose",re),Ne=new Map,U.programs=Ne);let Me=Ne.get(we);if(Me!==void 0){if(U.currentProgram===Me&&U.lightsStateVersion===ye)return to(M,Se),Me}else Se.uniforms=N.getUniforms(M),M.onBuild(G,Se,y),M.onBeforeCompile(Se,y),Me=N.acquireProgram(Se,we),Ne.set(we,Me),U.uniforms=Se.uniforms;let Pe=U.uniforms;(!M.isShaderMaterial&&!M.isRawShaderMaterial||M.clipping===!0)&&(Pe.clippingPlanes=ge.uniform),to(M,Se),U.needsLights=Tl(M),U.lightsStateVersion=ye,U.needsLights&&(Pe.ambientLightColor.value=W.state.ambient,Pe.lightProbe.value=W.state.probe,Pe.directionalLights.value=W.state.directional,Pe.directionalLightShadows.value=W.state.directionalShadow,Pe.spotLights.value=W.state.spot,Pe.spotLightShadows.value=W.state.spotShadow,Pe.rectAreaLights.value=W.state.rectArea,Pe.ltc_1.value=W.state.rectAreaLTC1,Pe.ltc_2.value=W.state.rectAreaLTC2,Pe.pointLights.value=W.state.point,Pe.pointLightShadows.value=W.state.pointShadow,Pe.hemisphereLights.value=W.state.hemi,Pe.directionalShadowMap.value=W.state.directionalShadowMap,Pe.directionalShadowMatrix.value=W.state.directionalShadowMatrix,Pe.spotShadowMap.value=W.state.spotShadowMap,Pe.spotLightMatrix.value=W.state.spotLightMatrix,Pe.spotLightMap.value=W.state.spotLightMap,Pe.pointShadowMap.value=W.state.pointShadowMap,Pe.pointShadowMatrix.value=W.state.pointShadowMatrix);let Qe=Me.getUniforms(),tt=Mi.seqWithValue(Qe.seq,Pe);return U.currentProgram=Me,U.uniformsList=tt,Me}function to(M,I){let G=Ie.get(M);G.outputColorSpace=I.outputColorSpace,G.instancing=I.instancing,G.instancingColor=I.instancingColor,G.skinning=I.skinning,G.morphTargets=I.morphTargets,G.morphNormals=I.morphNormals,G.morphColors=I.morphColors,G.morphTargetsCount=I.morphTargetsCount,G.numClippingPlanes=I.numClippingPlanes,G.numIntersection=I.numClipIntersection,G.vertexAlphas=I.vertexAlphas,G.vertexTangents=I.vertexTangents,G.toneMapping=I.toneMapping}function wl(M,I,G,U,W){I.isScene!==!0&&(I=pt),Re.resetTextureUnits();let pe=I.fog,ye=U.isMeshStandardMaterial?I.environment:null,Se=T===null?y.outputColorSpace:T.isXRRenderTarget===!0?T.texture.colorSpace:sn,we=(U.isMeshStandardMaterial?ot:Ve).get(U.envMap||ye),Ne=U.vertexColors===!0&&!!G.attributes.color&&G.attributes.color.itemSize===4,Me=!!G.attributes.tangent&&(!!U.normalMap||U.anisotropy>0),Pe=!!G.morphAttributes.position,Qe=!!G.morphAttributes.normal,tt=!!G.morphAttributes.color,Nt=Tn;U.toneMapped&&(T===null||T.isXRRenderTarget===!0)&&(Nt=y.toneMapping);let ln=G.morphAttributes.position||G.morphAttributes.normal||G.morphAttributes.color,nt=ln!==void 0?ln.length:0,Fe=Ie.get(U),mr=p.state.lights;if(de===!0&&(fe===!0||M!==v)){let Rt=M===v&&U.id===k;ge.setState(U,M,Rt)}let it=!1;U.version===Fe.__version?(Fe.needsLights&&Fe.lightsStateVersion!==mr.state.version||Fe.outputColorSpace!==Se||W.isInstancedMesh&&Fe.instancing===!1||!W.isInstancedMesh&&Fe.instancing===!0||W.isSkinnedMesh&&Fe.skinning===!1||!W.isSkinnedMesh&&Fe.skinning===!0||W.isInstancedMesh&&Fe.instancingColor===!0&&W.instanceColor===null||W.isInstancedMesh&&Fe.instancingColor===!1&&W.instanceColor!==null||Fe.envMap!==we||U.fog===!0&&Fe.fog!==pe||Fe.numClippingPlanes!==void 0&&(Fe.numClippingPlanes!==ge.numPlanes||Fe.numIntersection!==ge.numIntersection)||Fe.vertexAlphas!==Ne||Fe.vertexTangents!==Me||Fe.morphTargets!==Pe||Fe.morphNormals!==Qe||Fe.morphColors!==tt||Fe.toneMapping!==Nt||Ae.isWebGL2===!0&&Fe.morphTargetsCount!==nt)&&(it=!0):(it=!0,Fe.__version=U.version);let Ln=Fe.currentProgram;it===!0&&(Ln=rs(U,I,W));let no=!1,Pi=!1,gr=!1,bt=Ln.getUniforms(),In=Fe.uniforms;if(be.useProgram(Ln.program)&&(no=!0,Pi=!0,gr=!0),U.id!==k&&(k=U.id,Pi=!0),no||v!==M){bt.setValue(D,"projectionMatrix",M.projectionMatrix),bt.setValue(D,"viewMatrix",M.matrixWorldInverse);let Rt=bt.map.cameraPosition;Rt!==void 0&&Rt.setValue(D,ke.setFromMatrixPosition(M.matrixWorld)),Ae.logarithmicDepthBuffer&&bt.setValue(D,"logDepthBufFC",2/(Math.log(M.far+1)/Math.LN2)),(U.isMeshPhongMaterial||U.isMeshToonMaterial||U.isMeshLambertMaterial||U.isMeshBasicMaterial||U.isMeshStandardMaterial||U.isShaderMaterial)&&bt.setValue(D,"isOrthographic",M.isOrthographicCamera===!0),v!==M&&(v=M,Pi=!0,gr=!0)}if(W.isSkinnedMesh){bt.setOptional(D,W,"bindMatrix"),bt.setOptional(D,W,"bindMatrixInverse");let Rt=W.skeleton;Rt&&(Ae.floatVertexTextures?(Rt.boneTexture===null&&Rt.computeBoneTexture(),bt.setValue(D,"boneTexture",Rt.boneTexture,Re),bt.setValue(D,"boneTextureSize",Rt.boneTextureSize)):console.warn("THREE.WebGLRenderer: SkinnedMesh can only be used with WebGL 2. With WebGL 1 OES_texture_float and vertex textures support is required."))}let _r=G.morphAttributes;if((_r.position!==void 0||_r.normal!==void 0||_r.color!==void 0&&Ae.isWebGL2===!0)&&A.update(W,G,Ln),(Pi||Fe.receiveShadow!==W.receiveShadow)&&(Fe.receiveShadow=W.receiveShadow,bt.setValue(D,"receiveShadow",W.receiveShadow)),U.isMeshGouraudMaterial&&U.envMap!==null&&(In.envMap.value=we,In.flipEnvMap.value=we.isCubeTexture&&we.isRenderTargetTexture===!1?-1:1),Pi&&(bt.setValue(D,"toneMappingExposure",y.toneMappingExposure),Fe.needsLights&&El(In,gr),pe&&U.fog===!0&&ne.refreshFogUniforms(In,pe),ne.refreshMaterialUniforms(In,U,X,K,ve),Mi.upload(D,Fe.uniformsList,In,Re)),U.isShaderMaterial&&U.uniformsNeedUpdate===!0&&(Mi.upload(D,Fe.uniformsList,In,Re),U.uniformsNeedUpdate=!1),U.isSpriteMaterial&&bt.setValue(D,"center",W.center),bt.setValue(D,"modelViewMatrix",W.modelViewMatrix),bt.setValue(D,"normalMatrix",W.normalMatrix),bt.setValue(D,"modelMatrix",W.matrixWorld),U.isShaderMaterial||U.isRawShaderMaterial){let Rt=U.uniformsGroups;for(let xr=0,Al=Rt.length;xr<Al;xr++)if(Ae.isWebGL2){let io=Rt[xr];Te.update(io,Ln),Te.bind(io,Ln)}else console.warn("THREE.WebGLRenderer: Uniform Buffer Objects can only be used with WebGL 2.")}return Ln}function El(M,I){M.ambientLightColor.needsUpdate=I,M.lightProbe.needsUpdate=I,M.directionalLights.needsUpdate=I,M.directionalLightShadows.needsUpdate=I,M.pointLights.needsUpdate=I,M.pointLightShadows.needsUpdate=I,M.spotLights.needsUpdate=I,M.spotLightShadows.needsUpdate=I,M.rectAreaLights.needsUpdate=I,M.hemisphereLights.needsUpdate=I}function Tl(M){return M.isMeshLambertMaterial||M.isMeshToonMaterial||M.isMeshPhongMaterial||M.isMeshStandardMaterial||M.isShadowMaterial||M.isShaderMaterial&&M.lights===!0}this.getActiveCubeFace=function(){return w},this.getActiveMipmapLevel=function(){return P},this.getRenderTarget=function(){return T},this.setRenderTargetTextures=function(M,I,G){Ie.get(M.texture).__webglTexture=I,Ie.get(M.depthTexture).__webglTexture=G;let U=Ie.get(M);U.__hasExternalTextures=!0,U.__hasExternalTextures&&(U.__autoAllocateDepthBuffer=G===void 0,U.__autoAllocateDepthBuffer||xe.has("WEBGL_multisampled_render_to_texture")===!0&&(console.warn("THREE.WebGLRenderer: Render-to-texture extension was disabled because an external texture was provided"),U.__useRenderToTexture=!1))},this.setRenderTargetFramebuffer=function(M,I){let G=Ie.get(M);G.__webglFramebuffer=I,G.__useDefaultFramebuffer=I===void 0},this.setRenderTarget=function(M,I=0,G=0){T=M,w=I,P=G;let U=!0,W=null,pe=!1,ye=!1;if(M){let we=Ie.get(M);we.__useDefaultFramebuffer!==void 0?(be.bindFramebuffer(D.FRAMEBUFFER,null),U=!1):we.__webglFramebuffer===void 0?Re.setupRenderTarget(M):we.__hasExternalTextures&&Re.rebindTextures(M,Ie.get(M.texture).__webglTexture,Ie.get(M.depthTexture).__webglTexture);let Ne=M.texture;(Ne.isData3DTexture||Ne.isDataArrayTexture||Ne.isCompressedArrayTexture)&&(ye=!0);let Me=Ie.get(M).__webglFramebuffer;M.isWebGLCubeRenderTarget?(Array.isArray(Me[I])?W=Me[I][G]:W=Me[I],pe=!0):Ae.isWebGL2&&M.samples>0&&Re.useMultisampledRTT(M)===!1?W=Ie.get(M).__webglMultisampledFramebuffer:Array.isArray(Me)?W=Me[G]:W=Me,E.copy(M.viewport),Z.copy(M.scissor),te=M.scissorTest}else E.copy($).multiplyScalar(X).floor(),Z.copy(O).multiplyScalar(X).floor(),te=Y;if(be.bindFramebuffer(D.FRAMEBUFFER,W)&&Ae.drawBuffers&&U&&be.drawBuffers(M,W),be.viewport(E),be.scissor(Z),be.setScissorTest(te),pe){let we=Ie.get(M.texture);D.framebufferTexture2D(D.FRAMEBUFFER,D.COLOR_ATTACHMENT0,D.TEXTURE_CUBE_MAP_POSITIVE_X+I,we.__webglTexture,G)}else if(ye){let we=Ie.get(M.texture),Ne=I||0;D.framebufferTextureLayer(D.FRAMEBUFFER,D.COLOR_ATTACHMENT0,we.__webglTexture,G||0,Ne)}k=-1},this.readRenderTargetPixels=function(M,I,G,U,W,pe,ye){if(!(M&&M.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let Se=Ie.get(M).__webglFramebuffer;if(M.isWebGLCubeRenderTarget&&ye!==void 0&&(Se=Se[ye]),Se){be.bindFramebuffer(D.FRAMEBUFFER,Se);try{let we=M.texture,Ne=we.format,Me=we.type;if(Ne!==jt&&ae.convert(Ne)!==D.getParameter(D.IMPLEMENTATION_COLOR_READ_FORMAT)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}let Pe=Me===Wn&&(xe.has("EXT_color_buffer_half_float")||Ae.isWebGL2&&xe.has("EXT_color_buffer_float"));if(Me!==An&&ae.convert(Me)!==D.getParameter(D.IMPLEMENTATION_COLOR_READ_TYPE)&&!(Me===tn&&(Ae.isWebGL2||xe.has("OES_texture_float")||xe.has("WEBGL_color_buffer_float")))&&!Pe){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}I>=0&&I<=M.width-U&&G>=0&&G<=M.height-W&&D.readPixels(I,G,U,W,ae.convert(Ne),ae.convert(Me),pe)}finally{let we=T!==null?Ie.get(T).__webglFramebuffer:null;be.bindFramebuffer(D.FRAMEBUFFER,we)}}},this.copyFramebufferToTexture=function(M,I,G=0){let U=Math.pow(2,-G),W=Math.floor(I.image.width*U),pe=Math.floor(I.image.height*U);Re.setTexture2D(I,0),D.copyTexSubImage2D(D.TEXTURE_2D,G,0,0,M.x,M.y,W,pe),be.unbindTexture()},this.copyTextureToTexture=function(M,I,G,U=0){let W=I.image.width,pe=I.image.height,ye=ae.convert(G.format),Se=ae.convert(G.type);Re.setTexture2D(G,0),D.pixelStorei(D.UNPACK_FLIP_Y_WEBGL,G.flipY),D.pixelStorei(D.UNPACK_PREMULTIPLY_ALPHA_WEBGL,G.premultiplyAlpha),D.pixelStorei(D.UNPACK_ALIGNMENT,G.unpackAlignment),I.isDataTexture?D.texSubImage2D(D.TEXTURE_2D,U,M.x,M.y,W,pe,ye,Se,I.image.data):I.isCompressedTexture?D.compressedTexSubImage2D(D.TEXTURE_2D,U,M.x,M.y,I.mipmaps[0].width,I.mipmaps[0].height,ye,I.mipmaps[0].data):D.texSubImage2D(D.TEXTURE_2D,U,M.x,M.y,ye,Se,I.image),U===0&&G.generateMipmaps&&D.generateMipmap(D.TEXTURE_2D),be.unbindTexture()},this.copyTextureToTexture3D=function(M,I,G,U,W=0){if(y.isWebGL1Renderer){console.warn("THREE.WebGLRenderer.copyTextureToTexture3D: can only be used with WebGL2.");return}let pe=M.max.x-M.min.x+1,ye=M.max.y-M.min.y+1,Se=M.max.z-M.min.z+1,we=ae.convert(U.format),Ne=ae.convert(U.type),Me;if(U.isData3DTexture)Re.setTexture3D(U,0),Me=D.TEXTURE_3D;else if(U.isDataArrayTexture)Re.setTexture2DArray(U,0),Me=D.TEXTURE_2D_ARRAY;else{console.warn("THREE.WebGLRenderer.copyTextureToTexture3D: only supports THREE.DataTexture3D and THREE.DataTexture2DArray.");return}D.pixelStorei(D.UNPACK_FLIP_Y_WEBGL,U.flipY),D.pixelStorei(D.UNPACK_PREMULTIPLY_ALPHA_WEBGL,U.premultiplyAlpha),D.pixelStorei(D.UNPACK_ALIGNMENT,U.unpackAlignment);let Pe=D.getParameter(D.UNPACK_ROW_LENGTH),Qe=D.getParameter(D.UNPACK_IMAGE_HEIGHT),tt=D.getParameter(D.UNPACK_SKIP_PIXELS),Nt=D.getParameter(D.UNPACK_SKIP_ROWS),ln=D.getParameter(D.UNPACK_SKIP_IMAGES),nt=G.isCompressedTexture?G.mipmaps[0]:G.image;D.pixelStorei(D.UNPACK_ROW_LENGTH,nt.width),D.pixelStorei(D.UNPACK_IMAGE_HEIGHT,nt.height),D.pixelStorei(D.UNPACK_SKIP_PIXELS,M.min.x),D.pixelStorei(D.UNPACK_SKIP_ROWS,M.min.y),D.pixelStorei(D.UNPACK_SKIP_IMAGES,M.min.z),G.isDataTexture||G.isData3DTexture?D.texSubImage3D(Me,W,I.x,I.y,I.z,pe,ye,Se,we,Ne,nt.data):G.isCompressedArrayTexture?(console.warn("THREE.WebGLRenderer.copyTextureToTexture3D: untested support for compressed srcTexture."),D.compressedTexSubImage3D(Me,W,I.x,I.y,I.z,pe,ye,Se,we,nt.data)):D.texSubImage3D(Me,W,I.x,I.y,I.z,pe,ye,Se,we,Ne,nt),D.pixelStorei(D.UNPACK_ROW_LENGTH,Pe),D.pixelStorei(D.UNPACK_IMAGE_HEIGHT,Qe),D.pixelStorei(D.UNPACK_SKIP_PIXELS,tt),D.pixelStorei(D.UNPACK_SKIP_ROWS,Nt),D.pixelStorei(D.UNPACK_SKIP_IMAGES,ln),W===0&&U.generateMipmaps&&D.generateMipmap(Me),be.unbindTexture()},this.initTexture=function(M){M.isCubeTexture?Re.setTextureCube(M,0):M.isData3DTexture?Re.setTexture3D(M,0):M.isDataArrayTexture||M.isCompressedArrayTexture?Re.setTexture2DArray(M,0):Re.setTexture2D(M,0),be.unbindTexture()},this.resetState=function(){w=0,P=0,T=null,be.reset(),ce.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return gn}get physicallyCorrectLights(){return console.warn("THREE.WebGLRenderer: The property .physicallyCorrectLights has been removed. Set renderer.useLegacyLights instead."),!this.useLegacyLights}set physicallyCorrectLights(e){console.warn("THREE.WebGLRenderer: The property .physicallyCorrectLights has been removed. Set renderer.useLegacyLights instead."),this.useLegacyLights=!e}get outputEncoding(){return console.warn("THREE.WebGLRenderer: Property .outputEncoding has been removed. Use .outputColorSpace instead."),this.outputColorSpace===Xe?Hn:k0}set outputEncoding(e){console.warn("THREE.WebGLRenderer: Property .outputEncoding has been removed. Use .outputColorSpace instead."),this.outputColorSpace=e===Hn?Xe:sn}get useLegacyLights(){return console.warn("THREE.WebGLRenderer: The property .useLegacyLights has been deprecated. Migrate your lighting according to the following guide: https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733."),this._useLegacyLights}set useLegacyLights(e){console.warn("THREE.WebGLRenderer: The property .useLegacyLights has been deprecated. Migrate your lighting according to the following guide: https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733."),this._useLegacyLights=e}},xa=class extends Ki{};xa.prototype.isWebGL1Renderer=!0;var qs=class extends Et{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t}},ya=class{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e!==void 0?e.length/t:0,this.usage=ea,this.updateRange={offset:0,count:-1},this.version=0,this.uuid=_n()}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,n){e*=this.stride,n*=t.stride;for(let s=0,r=this.stride;s<r;s++)this.array[e+s]=t.array[n+s];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=_n()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);let t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(t,this.stride);return n.setUsage(this.usage),n}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){return e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=_n()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}},St=new L,Ys=class i{constructor(e,t,n,s=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=e,this.itemSize=t,this.offset=n,this.normalized=s}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,n=this.data.count;t<n;t++)St.fromBufferAttribute(this,t),St.applyMatrix4(e),this.setXYZ(t,St.x,St.y,St.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)St.fromBufferAttribute(this,t),St.applyNormalMatrix(e),this.setXYZ(t,St.x,St.y,St.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)St.fromBufferAttribute(this,t),St.transformDirection(e),this.setXYZ(t,St.x,St.y,St.z);return this}setX(e,t){return this.normalized&&(t=qe(t,this.array)),this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){return this.normalized&&(t=qe(t,this.array)),this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){return this.normalized&&(t=qe(t,this.array)),this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){return this.normalized&&(t=qe(t,this.array)),this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];return this.normalized&&(t=en(t,this.array)),t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];return this.normalized&&(t=en(t,this.array)),t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];return this.normalized&&(t=en(t,this.array)),t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];return this.normalized&&(t=en(t,this.array)),t}setXY(e,t,n){return e=e*this.data.stride+this.offset,this.normalized&&(t=qe(t,this.array),n=qe(n,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this}setXYZ(e,t,n,s){return e=e*this.data.stride+this.offset,this.normalized&&(t=qe(t,this.array),n=qe(n,this.array),s=qe(s,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=s,this}setXYZW(e,t,n,s,r){return e=e*this.data.stride+this.offset,this.normalized&&(t=qe(t,this.array),n=qe(n,this.array),s=qe(s,this.array),r=qe(r,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=s,this.data.array[e+3]=r,this}clone(e){if(e===void 0){console.log("THREE.InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");let t=[];for(let n=0;n<this.count;n++){let s=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[s+r])}return new It(new this.array.constructor(t),this.itemSize,this.normalized)}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.clone(e)),new i(e.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(e){if(e===void 0){console.log("THREE.InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");let t=[];for(let n=0;n<this.count;n++){let s=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[s+r])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:t,normalized:this.normalized}}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}},kt=class extends Rn{constructor(e){super(),this.isSpriteMaterial=!0,this.type="SpriteMaterial",this.color=new ze(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.rotation=e.rotation,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}},fi,Oi=new L,pi=new L,mi=new L,gi=new me,Ni=new me,$0=new rt,Ts=new L,Fi=new L,As=new L,S0=new me,Yr=new me,w0=new me,Vt=class extends Et{constructor(e){if(super(),this.isSprite=!0,this.type="Sprite",fi===void 0){fi=new Ot;let t=new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),n=new ya(t,5);fi.setIndex([0,1,2,0,2,3]),fi.setAttribute("position",new Ys(n,3,0,!1)),fi.setAttribute("uv",new Ys(n,2,3,!1))}this.geometry=fi,this.material=e!==void 0?e:new kt,this.center=new me(.5,.5)}raycast(e,t){e.camera===null&&console.error('THREE.Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'),pi.setFromMatrixScale(this.matrixWorld),$0.copy(e.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(e.camera.matrixWorldInverse,this.matrixWorld),mi.setFromMatrixPosition(this.modelViewMatrix),e.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&pi.multiplyScalar(-mi.z);let n=this.material.rotation,s,r;n!==0&&(r=Math.cos(n),s=Math.sin(n));let o=this.center;Rs(Ts.set(-.5,-.5,0),mi,o,pi,s,r),Rs(Fi.set(.5,-.5,0),mi,o,pi,s,r),Rs(As.set(.5,.5,0),mi,o,pi,s,r),S0.set(0,0),Yr.set(1,0),w0.set(1,1);let a=e.ray.intersectTriangle(Ts,Fi,As,!1,Oi);if(a===null&&(Rs(Fi.set(-.5,.5,0),mi,o,pi,s,r),Yr.set(0,1),a=e.ray.intersectTriangle(Ts,As,Fi,!1,Oi),a===null))return;let l=e.ray.origin.distanceTo(Oi);l<e.near||l>e.far||t.push({distance:l,point:Oi.clone(),uv:Bn.getInterpolation(Oi,Ts,Fi,As,S0,Yr,w0,new me),face:null,object:this})}copy(e,t){return super.copy(e,t),e.center!==void 0&&this.center.copy(e.center),this.material=e.material,this}};function Rs(i,e,t,n,s,r){gi.subVectors(i,t).addScalar(.5).multiply(n),s!==void 0?(Ni.x=r*gi.x-s*gi.y,Ni.y=s*gi.x+r*gi.y):Ni.copy(gi),i.copy(e),i.x+=Ni.x,i.y+=Ni.y,i.applyMatrix4($0)}var an=class extends ft{constructor(e,t,n,s,r,o,a,l,c){super(e,t,n,s,r,o,a,l,c),this.isCanvasTexture=!0,this.needsUpdate=!0}};var Ht=class extends Rn{constructor(e){super(),this.isMeshStandardMaterial=!0,this.defines={STANDARD:""},this.type="MeshStandardMaterial",this.color=new ze(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new ze(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=V0,this.normalScale=new me(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}};function wn(i,e,t){return K0(i)?new i.constructor(i.subarray(e,t!==void 0?t:i.length)):i.slice(e,t)}function Cs(i,e,t){return!i||!t&&i.constructor===e?i:typeof e.BYTES_PER_ELEMENT=="number"?new e(i):Array.prototype.slice.call(i)}function K0(i){return ArrayBuffer.isView(i)&&!(i instanceof DataView)}var Ti=class{constructor(e,t,n,s){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=s!==void 0?s:new t.constructor(n),this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,n=this._cachedIndex,s=t[n],r=t[n-1];n:{e:{let o;t:{i:if(!(e<s)){for(let a=n+2;;){if(s===void 0){if(e<r)break i;return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===a)break;if(r=s,s=t[++n],e<s)break e}o=t.length;break t}if(!(e>=r)){let a=t[1];e<a&&(n=2,r=a);for(let l=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===l)break;if(s=r,r=t[--n-1],e>=r)break e}o=n,n=0;break t}break n}for(;n<o;){let a=n+o>>>1;e<t[a]?o=a:n=a+1}if(s=t[n],r=t[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(s===void 0)return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,s)}return this.interpolate_(n,r,e,s)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,s=this.valueSize,r=e*s;for(let o=0;o!==s;++o)t[o]=n[r+o];return t}interpolate_(){throw new Error("call to abstract method")}intervalChanged_(){}},va=class extends Ti{constructor(e,t,n,s){super(e,t,n,s),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:Fo,endingEnd:Fo}}intervalChanged_(e,t,n){let s=this.parameterPositions,r=e-2,o=e+1,a=s[r],l=s[o];if(a===void 0)switch(this.getSettings_().endingStart){case zo:r=e,a=2*t-n;break;case Bo:r=s.length-2,a=t+s[r]-s[r+1];break;default:r=e,a=n}if(l===void 0)switch(this.getSettings_().endingEnd){case zo:o=e,l=2*n-t;break;case Bo:o=1,l=n+s[1]-s[0];break;default:o=e-1,l=t}let c=(n-t)*.5,h=this.valueSize;this._weightPrev=c/(t-a),this._weightNext=c/(l-n),this._offsetPrev=r*h,this._offsetNext=o*h}interpolate_(e,t,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=e*a,c=l-a,h=this._offsetPrev,d=this._offsetNext,f=this._weightPrev,m=this._weightNext,g=(n-t)/(s-t),_=g*g,p=_*g,u=-f*p+2*f*_-f*g,S=(1+f)*p+(-1.5-2*f)*_+(-.5+f)*g+1,y=(-1-m)*p+(1.5+m)*_+.5*g,R=m*p-m*_;for(let w=0;w!==a;++w)r[w]=u*o[h+w]+S*o[c+w]+y*o[l+w]+R*o[d+w];return r}},Ma=class extends Ti{constructor(e,t,n,s){super(e,t,n,s)}interpolate_(e,t,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=e*a,c=l-a,h=(n-t)/(s-t),d=1-h;for(let f=0;f!==a;++f)r[f]=o[c+f]*d+o[l+f]*h;return r}},ba=class extends Ti{constructor(e,t,n,s){super(e,t,n,s)}interpolate_(e){return this.copySampleValue_(e-1)}},$t=class{constructor(e,t,n,s){if(e===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(t===void 0||t.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+e);this.name=e,this.times=Cs(t,this.TimeBufferType),this.values=Cs(n,this.ValueBufferType),this.setInterpolation(s||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:Cs(e.times,Array),values:Cs(e.values,Array)};let s=e.getInterpolation();s!==e.DefaultInterpolation&&(n.interpolation=s)}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new ba(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new Ma(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new va(this.times,this.values,this.getValueSize(),e)}setInterpolation(e){let t;switch(e){case Ps:t=this.InterpolantFactoryMethodDiscrete;break;case Ls:t=this.InterpolantFactoryMethodLinear;break;case Er:t=this.InterpolantFactoryMethodSmooth;break}if(t===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return console.warn("THREE.KeyframeTrack:",n),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return Ps;case this.InterpolantFactoryMethodLinear:return Ls;case this.InterpolantFactoryMethodSmooth:return Er}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let n=0,s=t.length;n!==s;++n)t[n]+=e}return this}scale(e){if(e!==1){let t=this.times;for(let n=0,s=t.length;n!==s;++n)t[n]*=e}return this}trim(e,t){let n=this.times,s=n.length,r=0,o=s-1;for(;r!==s&&n[r]<e;)++r;for(;o!==-1&&n[o]>t;)--o;if(++o,r!==0||o!==s){r>=o&&(o=Math.max(o,1),r=o-1);let a=this.getValueSize();this.times=wn(n,r,o),this.values=wn(this.values,r*a,o*a)}return this}validate(){let e=!0,t=this.getValueSize();t-Math.floor(t)!==0&&(console.error("THREE.KeyframeTrack: Invalid value size in track.",this),e=!1);let n=this.times,s=this.values,r=n.length;r===0&&(console.error("THREE.KeyframeTrack: Track is empty.",this),e=!1);let o=null;for(let a=0;a!==r;a++){let l=n[a];if(typeof l=="number"&&isNaN(l)){console.error("THREE.KeyframeTrack: Time is not a valid number.",this,a,l),e=!1;break}if(o!==null&&o>l){console.error("THREE.KeyframeTrack: Out of order keys.",this,a,l,o),e=!1;break}o=l}if(s!==void 0&&K0(s))for(let a=0,l=s.length;a!==l;++a){let c=s[a];if(isNaN(c)){console.error("THREE.KeyframeTrack: Value is not a valid number.",this,a,c),e=!1;break}}return e}optimize(){let e=wn(this.times),t=wn(this.values),n=this.getValueSize(),s=this.getInterpolation()===Er,r=e.length-1,o=1;for(let a=1;a<r;++a){let l=!1,c=e[a],h=e[a+1];if(c!==h&&(a!==1||c!==e[0]))if(s)l=!0;else{let d=a*n,f=d-n,m=d+n;for(let g=0;g!==n;++g){let _=t[d+g];if(_!==t[f+g]||_!==t[m+g]){l=!0;break}}}if(l){if(a!==o){e[o]=e[a];let d=a*n,f=o*n;for(let m=0;m!==n;++m)t[f+m]=t[d+m]}++o}}if(r>0){e[o]=e[r];for(let a=r*n,l=o*n,c=0;c!==n;++c)t[l+c]=t[a+c];++o}return o!==e.length?(this.times=wn(e,0,o),this.values=wn(t,0,o*n)):(this.times=e,this.values=t),this}clone(){let e=wn(this.times,0),t=wn(this.values,0),n=this.constructor,s=new n(this.name,e,t);return s.createInterpolant=this.createInterpolant,s}};$t.prototype.TimeBufferType=Float32Array;$t.prototype.ValueBufferType=Float32Array;$t.prototype.DefaultInterpolation=Ls;var qn=class extends $t{};qn.prototype.ValueTypeName="bool";qn.prototype.ValueBufferType=Array;qn.prototype.DefaultInterpolation=Ps;qn.prototype.InterpolantFactoryMethodLinear=void 0;qn.prototype.InterpolantFactoryMethodSmooth=void 0;var Sa=class extends $t{};Sa.prototype.ValueTypeName="color";var wa=class extends $t{};wa.prototype.ValueTypeName="number";var Ea=class extends Ti{constructor(e,t,n,s){super(e,t,n,s)}interpolate_(e,t,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=(n-t)/(s-t),c=e*a;for(let h=c+a;c!==h;c+=4)Jt.slerpFlat(r,0,o,c-a,o,c,l);return r}},Qi=class extends $t{InterpolantFactoryMethodLinear(e){return new Ea(this.times,this.values,this.getValueSize(),e)}};Qi.prototype.ValueTypeName="quaternion";Qi.prototype.DefaultInterpolation=Ls;Qi.prototype.InterpolantFactoryMethodSmooth=void 0;var Yn=class extends $t{};Yn.prototype.ValueTypeName="string";Yn.prototype.ValueBufferType=Array;Yn.prototype.DefaultInterpolation=Ps;Yn.prototype.InterpolantFactoryMethodLinear=void 0;Yn.prototype.InterpolantFactoryMethodSmooth=void 0;var Ta=class extends $t{};Ta.prototype.ValueTypeName="vector";var Aa=class{constructor(e,t,n){let s=this,r=!1,o=0,a=0,l,c=[];this.onStart=void 0,this.onLoad=e,this.onProgress=t,this.onError=n,this.itemStart=function(h){a++,r===!1&&s.onStart!==void 0&&s.onStart(h,o,a),r=!0},this.itemEnd=function(h){o++,s.onProgress!==void 0&&s.onProgress(h,o,a),o===a&&(r=!1,s.onLoad!==void 0&&s.onLoad())},this.itemError=function(h){s.onError!==void 0&&s.onError(h)},this.resolveURL=function(h){return l?l(h):h},this.setURLModifier=function(h){return l=h,this},this.addHandler=function(h,d){return c.push(h,d),this},this.removeHandler=function(h){let d=c.indexOf(h);return d!==-1&&c.splice(d,2),this},this.getHandler=function(h){for(let d=0,f=c.length;d<f;d+=2){let m=c[d],g=c[d+1];if(m.global&&(m.lastIndex=0),m.test(h))return g}return null}}},Dp=new Aa,Ra=class{constructor(e){this.manager=e!==void 0?e:Dp,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={}}load(){}loadAsync(e,t){let n=this;return new Promise(function(s,r){n.load(e,s,t,r)})}parse(){}setCrossOrigin(e){return this.crossOrigin=e,this}setWithCredentials(e){return this.withCredentials=e,this}setPath(e){return this.path=e,this}setResourcePath(e){return this.resourcePath=e,this}setRequestHeader(e){return this.requestHeader=e,this}};Ra.DEFAULT_MATERIAL_NAME="__DEFAULT";var Zs=class extends Et{constructor(e,t=1){super(),this.isLight=!0,this.type="Light",this.color=new ze(e),this.intensity=t}dispose(){}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){let t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,this.groundColor!==void 0&&(t.object.groundColor=this.groundColor.getHex()),this.distance!==void 0&&(t.object.distance=this.distance),this.angle!==void 0&&(t.object.angle=this.angle),this.decay!==void 0&&(t.object.decay=this.decay),this.penumbra!==void 0&&(t.object.penumbra=this.penumbra),this.shadow!==void 0&&(t.object.shadow=this.shadow.toJSON()),t}};var Zr=new rt,E0=new L,T0=new L,Ca=class{constructor(e){this.camera=e,this.bias=0,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new me(512,512),this.map=null,this.mapPass=null,this.matrix=new rt,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new ji,this._frameExtents=new me(1,1),this._viewportCount=1,this._viewports=[new Ke(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(e){let t=this.camera,n=this.matrix;E0.setFromMatrixPosition(e.matrixWorld),t.position.copy(E0),T0.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(T0),t.updateMatrixWorld(),Zr.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),this._frustum.setFromProjectionMatrix(Zr),n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(Zr)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.bias=e.bias,this.radius=e.radius,this.mapSize.copy(e.mapSize),this}clone(){return new this.constructor().copy(this)}toJSON(){let e={};return this.bias!==0&&(e.bias=this.bias),this.normalBias!==0&&(e.normalBias=this.normalBias),this.radius!==1&&(e.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(e.mapSize=this.mapSize.toArray()),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}};var A0=new rt,zi=new L,jr=new L,Pa=class extends Ca{constructor(){super(new yt(90,1,.5,500)),this.isPointLightShadow=!0,this._frameExtents=new me(4,2),this._viewportCount=6,this._viewports=[new Ke(2,1,1,1),new Ke(0,1,1,1),new Ke(3,1,1,1),new Ke(1,1,1,1),new Ke(3,0,1,1),new Ke(1,0,1,1)],this._cubeDirections=[new L(1,0,0),new L(-1,0,0),new L(0,0,1),new L(0,0,-1),new L(0,1,0),new L(0,-1,0)],this._cubeUps=[new L(0,1,0),new L(0,1,0),new L(0,1,0),new L(0,1,0),new L(0,0,1),new L(0,0,-1)]}updateMatrices(e,t=0){let n=this.camera,s=this.matrix,r=e.distance||n.far;r!==n.far&&(n.far=r,n.updateProjectionMatrix()),zi.setFromMatrixPosition(e.matrixWorld),n.position.copy(zi),jr.copy(n.position),jr.add(this._cubeDirections[t]),n.up.copy(this._cubeUps[t]),n.lookAt(jr),n.updateMatrixWorld(),s.makeTranslation(-zi.x,-zi.y,-zi.z),A0.multiplyMatrices(n.projectionMatrix,n.matrixWorldInverse),this._frustum.setFromProjectionMatrix(A0)}},js=class extends Zs{constructor(e,t,n=0,s=2){super(e,t),this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=s,this.shadow=new Pa}get power(){return this.intensity*4*Math.PI}set power(e){this.intensity=e/(4*Math.PI)}dispose(){this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.decay=e.decay,this.shadow=e.shadow.clone(),this}};var Js=class extends Zs{constructor(e,t){super(e,t),this.isAmbientLight=!0,this.type="AmbientLight"}};var Ai=class{constructor(e=!0){this.autoStart=e,this.startTime=0,this.oldTime=0,this.elapsedTime=0,this.running=!1}start(){this.startTime=R0(),this.oldTime=this.startTime,this.elapsedTime=0,this.running=!0}stop(){this.getElapsedTime(),this.running=!1,this.autoStart=!1}getElapsedTime(){return this.getDelta(),this.elapsedTime}getDelta(){let e=0;if(this.autoStart&&!this.running)return this.start(),0;if(this.running){let t=R0();e=(t-this.oldTime)/1e3,this.oldTime=t,this.elapsedTime+=e}return e}};function R0(){return(typeof performance>"u"?Date:performance).now()}var Na="\\[\\]\\.:\\/",Up=new RegExp("["+Na+"]","g"),Fa="[^"+Na+"]",Op="[^"+Na.replace("\\.","")+"]",Np=/((?:WC+[\/:])*)/.source.replace("WC",Fa),Fp=/(WCOD+)?/.source.replace("WCOD",Op),zp=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",Fa),Bp=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",Fa),kp=new RegExp("^"+Np+Fp+zp+Bp+"$"),Vp=["material","materials","bones","map"],La=class{constructor(e,t,n){let s=n||$e.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,s)}getValue(e,t){this.bind();let n=this._targetGroup.nCachedObjects_,s=this._bindings[n];s!==void 0&&s.getValue(e,t)}setValue(e,t){let n=this._bindings;for(let s=this._targetGroup.nCachedObjects_,r=n.length;s!==r;++s)n[s].setValue(e,t)}bind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].bind()}unbind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].unbind()}},$e=class i{constructor(e,t,n){this.path=t,this.parsedPath=n||i.parseTrackName(t),this.node=i.findNode(e,this.parsedPath.nodeName),this.rootNode=e,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(e,t,n){return e&&e.isAnimationObjectGroup?new i.Composite(e,t,n):new i(e,t,n)}static sanitizeNodeName(e){return e.replace(/\s/g,"_").replace(Up,"")}static parseTrackName(e){let t=kp.exec(e);if(t===null)throw new Error("PropertyBinding: Cannot parse trackName: "+e);let n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},s=n.nodeName&&n.nodeName.lastIndexOf(".");if(s!==void 0&&s!==-1){let r=n.nodeName.substring(s+1);Vp.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,s),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("PropertyBinding: can not parse propertyName from trackName: "+e);return n}static findNode(e,t){if(t===void 0||t===""||t==="."||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){let n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){let n=function(r){for(let o=0;o<r.length;o++){let a=r[o];if(a.name===t||a.uuid===t)return a;let l=n(a.children);if(l)return l}return null},s=n(e.children);if(s)return s}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)e[t++]=n[s]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=e[t++]}_setValue_array_setNeedsUpdate(e,t){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let e=this.node,t=this.parsedPath,n=t.objectName,s=t.propertyName,r=t.propertyIndex;if(e||(e=i.findNode(this.rootNode,t.nodeName),this.node=e),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!e){console.warn("THREE.PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let c=t.objectIndex;switch(n){case"materials":if(!e.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.materials){console.error("THREE.PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}e=e.material.materials;break;case"bones":if(!e.skeleton){console.error("THREE.PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}e=e.skeleton.bones;for(let h=0;h<e.length;h++)if(e[h].name===c){c=h;break}break;case"map":if("map"in e){e=e.map;break}if(!e.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.map){console.error("THREE.PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}e=e.material.map;break;default:if(e[n]===void 0){console.error("THREE.PropertyBinding: Can not bind to objectName of node undefined.",this);return}e=e[n]}if(c!==void 0){if(e[c]===void 0){console.error("THREE.PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,e);return}e=e[c]}}let o=e[s];if(o===void 0){let c=t.nodeName;console.error("THREE.PropertyBinding: Trying to update property for track: "+c+"."+s+" but it wasn't found.",e);return}let a=this.Versioning.None;this.targetObject=e,e.needsUpdate!==void 0?a=this.Versioning.NeedsUpdate:e.matrixWorldNeedsUpdate!==void 0&&(a=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(r!==void 0){if(s==="morphTargetInfluences"){if(!e.geometry){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!e.geometry.morphAttributes){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}e.morphTargetDictionary[r]!==void 0&&(r=e.morphTargetDictionary[r])}l=this.BindingType.ArrayElement,this.resolvedProperty=o,this.propertyIndex=r}else o.fromArray!==void 0&&o.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=o):Array.isArray(o)?(l=this.BindingType.EntireArray,this.resolvedProperty=o):this.propertyName=s;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][a]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};$e.Composite=La;$e.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};$e.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};$e.prototype.GetterByBindingType=[$e.prototype._getValue_direct,$e.prototype._getValue_array,$e.prototype._getValue_arrayElement,$e.prototype._getValue_toArray];$e.prototype.SetterByBindingTypeAndVersioning=[[$e.prototype._setValue_direct,$e.prototype._setValue_direct_setNeedsUpdate,$e.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[$e.prototype._setValue_array,$e.prototype._setValue_array_setNeedsUpdate,$e.prototype._setValue_array_setMatrixWorldNeedsUpdate],[$e.prototype._setValue_arrayElement,$e.prototype._setValue_arrayElement_setNeedsUpdate,$e.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[$e.prototype._setValue_fromArray,$e.prototype._setValue_fromArray_setNeedsUpdate,$e.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var im=new Float32Array(1);var es=class{constructor(e=1,t=0,n=0){return this.radius=e,this.phi=t,this.theta=n,this}set(e,t,n){return this.radius=e,this.phi=t,this.theta=n,this}copy(e){return this.radius=e.radius,this.phi=e.phi,this.theta=e.theta,this}makeSafe(){return this.phi=Math.max(1e-6,Math.min(Math.PI-1e-6,this.phi)),this}setFromVector3(e){return this.setFromCartesianCoords(e.x,e.y,e.z)}setFromCartesianCoords(e,t,n){return this.radius=Math.sqrt(e*e+t*t+n*n),this.radius===0?(this.theta=0,this.phi=0):(this.theta=Math.atan2(e,n),this.phi=Math.acos(xt(t/this.radius,-1,1))),this}clone(){return new this.constructor().copy(this)}};typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"156"}}));typeof window<"u"&&(window.__THREE__?console.warn("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="156");function Ga(i,e,t,n,s,r,o,a){let l=(T,k,v,E)=>[new me(T/o,1-E/a),new me(v/o,1-E/a),new me(v/o,1-k/a),new me(T/o,1-k/a)],c=l(e+r,t,e+n+r,t+r),h=l(e+n+r,t,e+n*2+r,t+r),d=l(e,t+r,e+r,t+r+s),f=l(e+r,t+r,e+n+r,t+r+s),m=l(e+n+r,t+r,e+n+r*2,t+s+r),g=l(e+n+r*2,t+r,e+n*2+r*2,t+s+r),_=i.attributes.uv,p=[m[3],m[2],m[0],m[1]],u=[d[3],d[2],d[0],d[1]],S=[c[3],c[2],c[0],c[1]],y=[h[0],h[1],h[3],h[2]],R=[f[3],f[2],f[0],f[1]],w=[g[3],g[2],g[0],g[1]],P=[];for(let T of[p,u,S,y,R,w])for(let k of T)P.push(k.x,k.y);_.set(new Float32Array(P)),_.needsUpdate=!0}function Gt(i,e,t,n,s,r){Ga(i,e,t,n,s,r,64,64)}function za(i,e,t,n,s,r){Ga(i,e,t,n,s,r,64,32)}var xn=class extends Je{constructor(e,t){super(),Object.defineProperty(this,"innerLayer",{enumerable:!0,configurable:!0,writable:!0,value:e}),Object.defineProperty(this,"outerLayer",{enumerable:!0,configurable:!0,writable:!0,value:t}),e.name="inner",t.name="outer"}},Ba=class extends Je{constructor(){super(),Object.defineProperty(this,"head",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"body",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"rightArm",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"leftArm",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"rightLeg",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"leftLeg",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"modelListeners",{enumerable:!0,configurable:!0,writable:!0,value:[]}),Object.defineProperty(this,"slim",{enumerable:!0,configurable:!0,writable:!0,value:!1}),Object.defineProperty(this,"_map",{enumerable:!0,configurable:!0,writable:!0,value:null}),Object.defineProperty(this,"layer1Material",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"layer1MaterialBiased",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"layer2Material",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"layer2MaterialBiased",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),this.layer1Material=new Ht({side:Dt}),this.layer2Material=new Ht({side:vt,transparent:!0,alphaTest:1e-5}),this.layer1MaterialBiased=this.layer1Material.clone(),this.layer1MaterialBiased.polygonOffset=!0,this.layer1MaterialBiased.polygonOffsetFactor=1,this.layer1MaterialBiased.polygonOffsetUnits=1,this.layer2MaterialBiased=this.layer2Material.clone(),this.layer2MaterialBiased.polygonOffset=!0,this.layer2MaterialBiased.polygonOffsetFactor=1,this.layer2MaterialBiased.polygonOffsetUnits=1;let e=new et(8,8,8);Gt(e,0,0,8,8,8);let t=new Ge(e,this.layer1Material),n=new et(9,9,9);Gt(n,32,0,8,8,8);let s=new Ge(n,this.layer2Material);this.head=new xn(t,s),this.head.name="head",this.head.add(t,s),t.position.y=4,s.position.y=4,this.add(this.head);let r=new et(8,12,4);Gt(r,16,16,8,12,4);let o=new Ge(r,this.layer1Material),a=new et(8.5,12.5,4.5);Gt(a,16,32,8,12,4);let l=new Ge(a,this.layer2Material);this.body=new xn(o,l),this.body.name="body",this.body.add(o,l),this.body.position.y=-6,this.add(this.body);let c=new et,h=new Ge(c,this.layer1MaterialBiased);this.modelListeners.push(()=>{h.scale.x=this.slim?3:4,h.scale.y=12,h.scale.z=4,Gt(c,40,16,this.slim?3:4,12,4)});let d=new et,f=new Ge(d,this.layer2MaterialBiased);this.modelListeners.push(()=>{f.scale.x=this.slim?3.5:4.5,f.scale.y=12.5,f.scale.z=4.5,Gt(d,40,32,this.slim?3:4,12,4)});let m=new Je;m.add(h,f),this.modelListeners.push(()=>{m.position.x=this.slim?-.5:-1}),m.position.y=-4,this.rightArm=new xn(h,f),this.rightArm.name="rightArm",this.rightArm.add(m),this.rightArm.position.x=-5,this.rightArm.position.y=-2,this.add(this.rightArm);let g=new et,_=new Ge(g,this.layer1MaterialBiased);this.modelListeners.push(()=>{_.scale.x=this.slim?3:4,_.scale.y=12,_.scale.z=4,Gt(g,32,48,this.slim?3:4,12,4)});let p=new et,u=new Ge(p,this.layer2MaterialBiased);this.modelListeners.push(()=>{u.scale.x=this.slim?3.5:4.5,u.scale.y=12.5,u.scale.z=4.5,Gt(p,48,48,this.slim?3:4,12,4)});let S=new Je;S.add(_,u),this.modelListeners.push(()=>{S.position.x=this.slim?.5:1}),S.position.y=-4,this.leftArm=new xn(_,u),this.leftArm.name="leftArm",this.leftArm.add(S),this.leftArm.position.x=5,this.leftArm.position.y=-2,this.add(this.leftArm);let y=new et(4,12,4);Gt(y,0,16,4,12,4);let R=new Ge(y,this.layer1MaterialBiased),w=new et(4.5,12.5,4.5);Gt(w,0,32,4,12,4);let P=new Ge(w,this.layer2MaterialBiased),T=new Je;T.add(R,P),T.position.y=-6,this.rightLeg=new xn(R,P),this.rightLeg.name="rightLeg",this.rightLeg.add(T),this.rightLeg.position.x=-1.9,this.rightLeg.position.y=-12,this.rightLeg.position.z=-.1,this.add(this.rightLeg);let k=new et(4,12,4);Gt(k,16,48,4,12,4);let v=new Ge(k,this.layer1MaterialBiased),E=new et(4.5,12.5,4.5);Gt(E,0,48,4,12,4);let Z=new Ge(E,this.layer2MaterialBiased),te=new Je;te.add(v,Z),te.position.y=-6,this.leftLeg=new xn(v,Z),this.leftLeg.name="leftLeg",this.leftLeg.add(te),this.leftLeg.position.x=1.9,this.leftLeg.position.y=-12,this.leftLeg.position.z=-.1,this.add(this.leftLeg),this.modelType="default"}get map(){return this._map}set map(e){this._map=e,this.layer1Material.map=e,this.layer1Material.needsUpdate=!0,this.layer1MaterialBiased.map=e,this.layer1MaterialBiased.needsUpdate=!0,this.layer2Material.map=e,this.layer2Material.needsUpdate=!0,this.layer2MaterialBiased.map=e,this.layer2MaterialBiased.needsUpdate=!0}get modelType(){return this.slim?"slim":"default"}set modelType(e){this.slim=e==="slim",this.modelListeners.forEach(t=>t())}getBodyParts(){return this.children.filter(e=>e instanceof xn)}setInnerLayerVisible(e){this.getBodyParts().forEach(t=>t.innerLayer.visible=e)}setOuterLayerVisible(e){this.getBodyParts().forEach(t=>t.outerLayer.visible=e)}resetJoints(){this.head.rotation.set(0,0,0),this.leftArm.rotation.set(0,0,0),this.rightArm.rotation.set(0,0,0),this.leftLeg.rotation.set(0,0,0),this.rightLeg.rotation.set(0,0,0),this.body.rotation.set(0,0,0),this.head.position.y=0,this.body.position.y=-6,this.body.position.z=0,this.rightArm.position.x=-5,this.rightArm.position.y=-2,this.rightArm.position.z=0,this.leftArm.position.x=5,this.leftArm.position.y=-2,this.leftArm.position.z=0,this.rightLeg.position.x=-1.9,this.rightLeg.position.y=-12,this.rightLeg.position.z=-.1,this.leftLeg.position.x=1.9,this.leftLeg.position.y=-12,this.leftLeg.position.z=-.1}},ka=class extends Je{constructor(){super(),Object.defineProperty(this,"cape",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"material",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),this.material=new Ht({side:vt,transparent:!0,alphaTest:1e-5});let e=new et(10,16,1);za(e,0,0,10,16,1),this.cape=new Ge(e,this.material),this.cape.position.y=-8,this.cape.position.z=.5,this.add(this.cape)}get map(){return this.material.map}set map(e){this.material.map=e,this.material.needsUpdate=!0}},Va=class extends Je{constructor(){super(),Object.defineProperty(this,"leftWing",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"rightWing",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"material",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),this.material=new Ht({side:vt,transparent:!0,alphaTest:1e-5});let e=new et(12,22,4);za(e,22,0,10,20,2);let t=new Ge(e,this.material);t.position.x=-5,t.position.y=-10,t.position.z=-1,this.leftWing=new Je,this.leftWing.add(t),this.add(this.leftWing);let n=new et(12,22,4);za(n,22,0,10,20,2);let s=new Ge(n,this.material);s.scale.x=-1,s.position.x=5,s.position.y=-10,s.position.z=-1,this.rightWing=new Je,this.rightWing.add(s),this.add(this.rightWing),this.leftWing.position.x=5,this.leftWing.rotation.x=.2617994,this.resetJoints()}resetJoints(){this.leftWing.rotation.y=.01,this.leftWing.rotation.z=.2617994,this.updateRightWing()}updateRightWing(){this.rightWing.position.x=-this.leftWing.position.x,this.rightWing.position.y=this.leftWing.position.y,this.rightWing.rotation.x=this.leftWing.rotation.x,this.rightWing.rotation.y=-this.leftWing.rotation.y,this.rightWing.rotation.z=-this.leftWing.rotation.z}get map(){return this.material.map}set map(e){this.material.map=e,this.material.needsUpdate=!0}},Ha=class extends Je{constructor(){super(),Object.defineProperty(this,"rightEar",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"leftEar",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"material",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),this.material=new Ht({side:Dt});let e=new et(8,8,4/3);Ga(e,0,0,6,6,1,14,7),this.rightEar=new Ge(e,this.material),this.rightEar.name="rightEar",this.rightEar.position.x=-6,this.add(this.rightEar),this.leftEar=new Ge(e,this.material),this.leftEar.name="leftEar",this.leftEar.position.x=6,this.add(this.leftEar)}get map(){return this.material.map}set map(e){this.material.map=e,this.material.needsUpdate=!0}},Q0=10.8*Math.PI/180,er=class extends Je{constructor(){super(),Object.defineProperty(this,"skin",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"cape",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"elytra",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"ears",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),this.skin=new Ba,this.skin.name="skin",this.skin.position.y=8,this.add(this.skin),this.cape=new ka,this.cape.name="cape",this.cape.position.y=8,this.cape.position.z=-2,this.cape.rotation.x=Q0,this.cape.rotation.y=Math.PI,this.add(this.cape),this.elytra=new Va,this.elytra.name="elytra",this.elytra.position.y=8,this.elytra.position.z=-2,this.elytra.visible=!1,this.add(this.elytra),this.ears=new Ha,this.ears.name="ears",this.ears.position.y=10,this.ears.position.z=2/3,this.ears.visible=!1,this.skin.head.add(this.ears)}get backEquipment(){return this.cape.visible?"cape":this.elytra.visible?"elytra":null}set backEquipment(e){this.cape.visible=e==="cape",this.elytra.visible=e==="elytra"}resetJoints(){this.skin.resetJoints(),this.cape.rotation.x=Q0,this.cape.position.y=8,this.cape.position.z=-2,this.elytra.position.y=8,this.elytra.position.z=-2,this.elytra.rotation.x=0,this.elytra.resetJoints()}};function ts(i){return i instanceof HTMLImageElement||i instanceof HTMLVideoElement||i instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&i instanceof ImageBitmap||typeof OffscreenCanvas<"u"&&i instanceof OffscreenCanvas}function Wa(i,e,t,n,s){let r=i.getImageData(e,t,n,s);for(let o=0;o<n;o++)for(let a=0;a<s;a++){let l=(o+a*n)*4;if(r.data[l+3]!==255)return!0}return!1}function tr(i){return i/64}function el(i,e,t){if(t){if(Wa(i,0,0,e,e))return}else if(Wa(i,0,0,e,e/2))return;let n=tr(e),s=(r,o,a,l)=>i.clearRect(r*n,o*n,a*n,l*n);s(40,0,8,8),s(48,0,8,8),s(32,8,8,8),s(40,8,8,8),s(48,8,8,8),s(56,8,8,8),t&&(s(4,32,4,4),s(8,32,4,4),s(0,36,4,12),s(4,36,4,12),s(8,36,4,12),s(12,36,4,12),s(20,32,8,4),s(28,32,8,4),s(16,36,4,12),s(20,36,8,12),s(28,36,4,12),s(32,36,8,12),s(44,32,4,4),s(48,32,4,4),s(40,36,4,12),s(44,36,4,12),s(48,36,4,12),s(52,36,12,12),s(4,48,4,4),s(8,48,4,4),s(0,52,4,12),s(4,52,4,12),s(8,52,4,12),s(12,52,4,12),s(52,48,4,4),s(56,48,4,4),s(48,52,4,12),s(52,52,4,12),s(56,52,4,12),s(60,52,4,12))}function Hp(i,e){i.save(),i.scale(-1,1);let t=tr(e),n=(s,r,o,a,l,c)=>i.drawImage(i.canvas,s*t,r*t,o*t,a*t,-l*t,c*t,-o*t,a*t);n(4,16,4,4,20,48),n(8,16,4,4,24,48),n(0,20,4,12,24,52),n(4,20,4,12,20,52),n(8,20,4,12,16,52),n(12,20,4,12,28,52),n(44,16,4,4,36,48),n(48,16,4,4,40,48),n(40,20,4,12,40,52),n(44,20,4,12,36,52),n(48,20,4,12,32,52),n(52,20,4,12,44,52),i.restore()}function tl(i,e){let t=!1;if(e.width!==e.height)if(e.width===2*e.height)t=!0;else throw new Error(`Bad skin size: ${e.width}x${e.height}`);let n=i.getContext("2d",{willReadFrequently:!0});if(t){let s=e.width;i.width=s,i.height=s,n.clearRect(0,0,s,s),n.drawImage(e,0,0,s,s/2),Hp(n,s),el(n,i.width,!1)}else i.width=e.width,i.height=e.height,n.clearRect(0,0,e.width,e.height),n.drawImage(e,0,0,i.width,i.height),el(n,i.width,!0)}function Gp(i){if(i.width===2*i.height)return i.width/64;if(i.width*17===i.height*22)return i.width/22;if(i.width*11===i.height*23)return i.width/46;throw new Error(`Bad cape size: ${i.width}x${i.height}`)}function nl(i,e){let t=Gp(e);i.width=64*t,i.height=32*t;let n=i.getContext("2d",{willReadFrequently:!0});n.clearRect(0,0,i.width,i.height),n.drawImage(e,0,0,e.width,e.height)}function Wp(i,e,t,n,s){let r=i.getImageData(e,t,n,s);for(let o=0;o<n;o++)for(let a=0;a<s;a++){let l=(o+a*n)*4;if(!(r.data[l+0]===0&&r.data[l+1]===0&&r.data[l+2]===0&&r.data[l+3]===255))return!1}return!0}function Xp(i,e,t,n,s){let r=i.getImageData(e,t,n,s);for(let o=0;o<n;o++)for(let a=0;a<s;a++){let l=(o+a*n)*4;if(!(r.data[l+0]===255&&r.data[l+1]===255&&r.data[l+2]===255&&r.data[l+3]===255))return!1}return!0}function il(i){let e=tr(i.width),t=i.getContext("2d",{willReadFrequently:!0}),n=(a,l,c,h)=>Wa(t,a*e,l*e,c*e,h*e),s=(a,l,c,h)=>Wp(t,a*e,l*e,c*e,h*e),r=(a,l,c,h)=>Xp(t,a*e,l*e,c*e,h*e);return n(50,16,2,4)||n(54,20,2,12)||n(42,48,2,4)||n(46,52,2,12)||s(50,16,2,4)&&s(54,20,2,12)&&s(42,48,2,4)&&s(46,52,2,12)||r(50,16,2,4)&&r(54,20,2,12)&&r(42,48,2,4)&&r(46,52,2,12)?"slim":"default"}function qp(i){if(i.width===i.height*2&&i.height%7===0)return i.height/7;throw new Error(`Bad ears size: ${i.width}x${i.height}`)}function sl(i,e){let t=qp(e);i.width=14*t,i.height=7*t;let n=i.getContext("2d",{willReadFrequently:!0});n.clearRect(0,0,i.width,i.height),n.drawImage(e,0,0,e.width,e.height)}function Xa(i,e){if(e.width!==e.height&&e.width!==2*e.height)throw new Error(`Bad skin size: ${e.width}x${e.height}`);let t=tr(e.width),n=14*t,s=7*t;i.width=n,i.height=s;let r=i.getContext("2d",{willReadFrequently:!0});r.clearRect(0,0,n,s),r.drawImage(e,24*t,0,n,s,0,0,n,s)}async function ns(i){let e=document.createElement("img");return new Promise((t,n)=>{e.onload=()=>t(e),e.onerror=n,e.crossOrigin="anonymous",typeof i=="string"?e.src=i:(i.crossOrigin!==void 0&&(e.crossOrigin=i.crossOrigin),i.referrerPolicy!==void 0&&(e.referrerPolicy=i.referrerPolicy),e.src=i.src)})}var rl={type:"change"},qa={type:"start"},al={type:"end"},nr=new Zi,ol=new Yt,Yp=Math.cos(70*H0.DEG2RAD),ir=class extends rn{constructor(e,t){super(),this.object=e,this.domElement=t,this.domElement.style.touchAction="none",this.enabled=!0,this.target=new L,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:"ArrowLeft",UP:"ArrowUp",RIGHT:"ArrowRight",BOTTOM:"ArrowDown"},this.mouseButtons={LEFT:Zn.ROTATE,MIDDLE:Zn.DOLLY,RIGHT:Zn.PAN},this.touches={ONE:jn.ROTATE,TWO:jn.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._domElementKeyEvents=null,this.getPolarAngle=function(){return a.phi},this.getAzimuthalAngle=function(){return a.theta},this.getDistance=function(){return this.object.position.distanceTo(this.target)},this.listenToKeyEvents=function(A){A.addEventListener("keydown",x),this._domElementKeyEvents=A},this.stopListenToKeyEvents=function(){this._domElementKeyEvents.removeEventListener("keydown",x),this._domElementKeyEvents=null},this.saveState=function(){n.target0.copy(n.target),n.position0.copy(n.object.position),n.zoom0=n.object.zoom},this.reset=function(){n.target.copy(n.target0),n.object.position.copy(n.position0),n.object.zoom=n.zoom0,n.object.updateProjectionMatrix(),n.dispatchEvent(rl),n.update(),r=s.NONE},this.update=(function(){let A=new L,j=new Jt().setFromUnitVectors(e.up,new L(0,1,0)),he=j.clone().invert(),ae=new L,ce=new Jt,Te=new L,Be=2*Math.PI;return function(le=null){let B=n.object.position;A.copy(B).sub(n.target),A.applyQuaternion(j),a.setFromVector3(A),n.autoRotate&&r===s.NONE&&Z(v(le)),n.enableDamping?(a.theta+=l.theta*n.dampingFactor,a.phi+=l.phi*n.dampingFactor):(a.theta+=l.theta,a.phi+=l.phi);let ee=n.minAzimuthAngle,re=n.maxAzimuthAngle;isFinite(ee)&&isFinite(re)&&(ee<-Math.PI?ee+=Be:ee>Math.PI&&(ee-=Be),re<-Math.PI?re+=Be:re>Math.PI&&(re-=Be),ee<=re?a.theta=Math.max(ee,Math.min(re,a.theta)):a.theta=a.theta>(ee+re)/2?Math.max(ee,a.theta):Math.min(re,a.theta)),a.phi=Math.max(n.minPolarAngle,Math.min(n.maxPolarAngle,a.phi)),a.makeSafe(),n.enableDamping===!0?n.target.addScaledVector(h,n.dampingFactor):n.target.add(h),n.zoomToCursor&&P||n.object.isOrthographicCamera?a.radius=J(a.radius):a.radius=J(a.radius*c),A.setFromSpherical(a),A.applyQuaternion(he),B.copy(n.target).add(A),n.object.lookAt(n.target),n.enableDamping===!0?(l.theta*=1-n.dampingFactor,l.phi*=1-n.dampingFactor,h.multiplyScalar(1-n.dampingFactor)):(l.set(0,0,0),h.set(0,0,0));let Oe=!1;if(n.zoomToCursor&&P){let We=null;if(n.object.isPerspectiveCamera){let Ye=A.length();We=J(Ye*c);let At=Ye-We;n.object.position.addScaledVector(R,At),n.object.updateMatrixWorld()}else if(n.object.isOrthographicCamera){let Ye=new L(w.x,w.y,0);Ye.unproject(n.object),n.object.zoom=Math.max(n.minZoom,Math.min(n.maxZoom,n.object.zoom/c)),n.object.updateProjectionMatrix(),Oe=!0;let At=new L(w.x,w.y,0);At.unproject(n.object),n.object.position.sub(At).add(Ye),n.object.updateMatrixWorld(),We=A.length()}else console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled."),n.zoomToCursor=!1;We!==null&&(this.screenSpacePanning?n.target.set(0,0,-1).transformDirection(n.object.matrix).multiplyScalar(We).add(n.object.position):(nr.origin.copy(n.object.position),nr.direction.set(0,0,-1).transformDirection(n.object.matrix),Math.abs(n.object.up.dot(nr.direction))<Yp?e.lookAt(n.target):(ol.setFromNormalAndCoplanarPoint(n.object.up,n.target),nr.intersectPlane(ol,n.target))))}else n.object.isOrthographicCamera&&(n.object.zoom=Math.max(n.minZoom,Math.min(n.maxZoom,n.object.zoom/c)),n.object.updateProjectionMatrix(),Oe=!0);return c=1,P=!1,Oe||ae.distanceToSquared(n.object.position)>o||8*(1-ce.dot(n.object.quaternion))>o||Te.distanceToSquared(n.target)>0?(n.dispatchEvent(rl),ae.copy(n.object.position),ce.copy(n.object.quaternion),Te.copy(n.target),Oe=!1,!0):!1}})(),this.dispose=function(){n.domElement.removeEventListener("contextmenu",Q),n.domElement.removeEventListener("pointerdown",Ie),n.domElement.removeEventListener("pointercancel",Ve),n.domElement.removeEventListener("wheel",b),n.domElement.removeEventListener("pointermove",Re),n.domElement.removeEventListener("pointerup",Ve),n._domElementKeyEvents!==null&&(n._domElementKeyEvents.removeEventListener("keydown",x),n._domElementKeyEvents=null)};let n=this,s={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},r=s.NONE,o=1e-6,a=new es,l=new es,c=1,h=new L,d=new me,f=new me,m=new me,g=new me,_=new me,p=new me,u=new me,S=new me,y=new me,R=new L,w=new me,P=!1,T=[],k={};function v(A){return A!==null?2*Math.PI/60*n.autoRotateSpeed*A:2*Math.PI/60/60*n.autoRotateSpeed}function E(){return Math.pow(.95,n.zoomSpeed)}function Z(A){l.theta-=A}function te(A){l.phi-=A}let F=(function(){let A=new L;return function(he,ae){A.setFromMatrixColumn(ae,0),A.multiplyScalar(-he),h.add(A)}})(),H=(function(){let A=new L;return function(he,ae){n.screenSpacePanning===!0?A.setFromMatrixColumn(ae,1):(A.setFromMatrixColumn(ae,0),A.crossVectors(n.object.up,A)),A.multiplyScalar(he),h.add(A)}})(),V=(function(){let A=new L;return function(he,ae){let ce=n.domElement;if(n.object.isPerspectiveCamera){let Te=n.object.position;A.copy(Te).sub(n.target);let Be=A.length();Be*=Math.tan(n.object.fov/2*Math.PI/180),F(2*he*Be/ce.clientHeight,n.object.matrix),H(2*ae*Be/ce.clientHeight,n.object.matrix)}else n.object.isOrthographicCamera?(F(he*(n.object.right-n.object.left)/n.object.zoom/ce.clientWidth,n.object.matrix),H(ae*(n.object.top-n.object.bottom)/n.object.zoom/ce.clientHeight,n.object.matrix)):(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled."),n.enablePan=!1)}})();function K(A){n.object.isPerspectiveCamera||n.object.isOrthographicCamera?c/=A:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),n.enableZoom=!1)}function X(A){n.object.isPerspectiveCamera||n.object.isOrthographicCamera?c*=A:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),n.enableZoom=!1)}function q(A){if(!n.zoomToCursor)return;P=!0;let j=n.domElement.getBoundingClientRect(),he=A.clientX-j.left,ae=A.clientY-j.top,ce=j.width,Te=j.height;w.x=he/ce*2-1,w.y=-(ae/Te)*2+1,R.set(w.x,w.y,1).unproject(n.object).sub(n.object.position).normalize()}function J(A){return Math.max(n.minDistance,Math.min(n.maxDistance,A))}function $(A){d.set(A.clientX,A.clientY)}function O(A){q(A),u.set(A.clientX,A.clientY)}function Y(A){g.set(A.clientX,A.clientY)}function ue(A){f.set(A.clientX,A.clientY),m.subVectors(f,d).multiplyScalar(n.rotateSpeed);let j=n.domElement;Z(2*Math.PI*m.x/j.clientHeight),te(2*Math.PI*m.y/j.clientHeight),d.copy(f),n.update()}function de(A){S.set(A.clientX,A.clientY),y.subVectors(S,u),y.y>0?K(E()):y.y<0&&X(E()),u.copy(S),n.update()}function fe(A){_.set(A.clientX,A.clientY),p.subVectors(_,g).multiplyScalar(n.panSpeed),V(p.x,p.y),g.copy(_),n.update()}function ve(A){q(A),A.deltaY<0?X(E()):A.deltaY>0&&K(E()),n.update()}function Ee(A){let j=!1;switch(A.code){case n.keys.UP:A.ctrlKey||A.metaKey||A.shiftKey?te(2*Math.PI*n.rotateSpeed/n.domElement.clientHeight):V(0,n.keyPanSpeed),j=!0;break;case n.keys.BOTTOM:A.ctrlKey||A.metaKey||A.shiftKey?te(-2*Math.PI*n.rotateSpeed/n.domElement.clientHeight):V(0,-n.keyPanSpeed),j=!0;break;case n.keys.LEFT:A.ctrlKey||A.metaKey||A.shiftKey?Z(2*Math.PI*n.rotateSpeed/n.domElement.clientHeight):V(n.keyPanSpeed,0),j=!0;break;case n.keys.RIGHT:A.ctrlKey||A.metaKey||A.shiftKey?Z(-2*Math.PI*n.rotateSpeed/n.domElement.clientHeight):V(-n.keyPanSpeed,0),j=!0;break}j&&(A.preventDefault(),n.update())}function _e(){if(T.length===1)d.set(T[0].pageX,T[0].pageY);else{let A=.5*(T[0].pageX+T[1].pageX),j=.5*(T[0].pageY+T[1].pageY);d.set(A,j)}}function ke(){if(T.length===1)g.set(T[0].pageX,T[0].pageY);else{let A=.5*(T[0].pageX+T[1].pageX),j=.5*(T[0].pageY+T[1].pageY);g.set(A,j)}}function pt(){let A=T[0].pageX-T[1].pageX,j=T[0].pageY-T[1].pageY,he=Math.sqrt(A*A+j*j);u.set(0,he)}function Ce(){n.enableZoom&&pt(),n.enablePan&&ke()}function D(){n.enableZoom&&pt(),n.enableRotate&&_e()}function at(A){if(T.length==1)f.set(A.pageX,A.pageY);else{let he=z(A),ae=.5*(A.pageX+he.x),ce=.5*(A.pageY+he.y);f.set(ae,ce)}m.subVectors(f,d).multiplyScalar(n.rotateSpeed);let j=n.domElement;Z(2*Math.PI*m.x/j.clientHeight),te(2*Math.PI*m.y/j.clientHeight),d.copy(f)}function xe(A){if(T.length===1)_.set(A.pageX,A.pageY);else{let j=z(A),he=.5*(A.pageX+j.x),ae=.5*(A.pageY+j.y);_.set(he,ae)}p.subVectors(_,g).multiplyScalar(n.panSpeed),V(p.x,p.y),g.copy(_)}function Ae(A){let j=z(A),he=A.pageX-j.x,ae=A.pageY-j.y,ce=Math.sqrt(he*he+ae*ae);S.set(0,ce),y.set(0,Math.pow(S.y/u.y,n.zoomSpeed)),K(y.y),u.copy(S)}function be(A){n.enableZoom&&Ae(A),n.enablePan&&xe(A)}function Ze(A){n.enableZoom&&Ae(A),n.enableRotate&&at(A)}function Ie(A){n.enabled!==!1&&(T.length===0&&(n.domElement.setPointerCapture(A.pointerId),n.domElement.addEventListener("pointermove",Re),n.domElement.addEventListener("pointerup",Ve)),ie(A),A.pointerType==="touch"?N(A):ot(A))}function Re(A){n.enabled!==!1&&(A.pointerType==="touch"?ne(A):ut(A))}function Ve(A){ge(A),T.length===0&&(n.domElement.releasePointerCapture(A.pointerId),n.domElement.removeEventListener("pointermove",Re),n.domElement.removeEventListener("pointerup",Ve)),n.dispatchEvent(al),r=s.NONE}function ot(A){let j;switch(A.button){case 0:j=n.mouseButtons.LEFT;break;case 1:j=n.mouseButtons.MIDDLE;break;case 2:j=n.mouseButtons.RIGHT;break;default:j=-1}switch(j){case Zn.DOLLY:if(n.enableZoom===!1)return;O(A),r=s.DOLLY;break;case Zn.ROTATE:if(A.ctrlKey||A.metaKey||A.shiftKey){if(n.enablePan===!1)return;Y(A),r=s.PAN}else{if(n.enableRotate===!1)return;$(A),r=s.ROTATE}break;case Zn.PAN:if(A.ctrlKey||A.metaKey||A.shiftKey){if(n.enableRotate===!1)return;$(A),r=s.ROTATE}else{if(n.enablePan===!1)return;Y(A),r=s.PAN}break;default:r=s.NONE}r!==s.NONE&&n.dispatchEvent(qa)}function ut(A){switch(r){case s.ROTATE:if(n.enableRotate===!1)return;ue(A);break;case s.DOLLY:if(n.enableZoom===!1)return;de(A);break;case s.PAN:if(n.enablePan===!1)return;fe(A);break}}function b(A){n.enabled===!1||n.enableZoom===!1||r!==s.NONE||(A.preventDefault(),n.dispatchEvent(qa),ve(A),n.dispatchEvent(al))}function x(A){n.enabled===!1||n.enablePan===!1||Ee(A)}function N(A){switch(se(A),T.length){case 1:switch(n.touches.ONE){case jn.ROTATE:if(n.enableRotate===!1)return;_e(),r=s.TOUCH_ROTATE;break;case jn.PAN:if(n.enablePan===!1)return;ke(),r=s.TOUCH_PAN;break;default:r=s.NONE}break;case 2:switch(n.touches.TWO){case jn.DOLLY_PAN:if(n.enableZoom===!1&&n.enablePan===!1)return;Ce(),r=s.TOUCH_DOLLY_PAN;break;case jn.DOLLY_ROTATE:if(n.enableZoom===!1&&n.enableRotate===!1)return;D(),r=s.TOUCH_DOLLY_ROTATE;break;default:r=s.NONE}break;default:r=s.NONE}r!==s.NONE&&n.dispatchEvent(qa)}function ne(A){switch(se(A),r){case s.TOUCH_ROTATE:if(n.enableRotate===!1)return;at(A),n.update();break;case s.TOUCH_PAN:if(n.enablePan===!1)return;xe(A),n.update();break;case s.TOUCH_DOLLY_PAN:if(n.enableZoom===!1&&n.enablePan===!1)return;be(A),n.update();break;case s.TOUCH_DOLLY_ROTATE:if(n.enableZoom===!1&&n.enableRotate===!1)return;Ze(A),n.update();break;default:r=s.NONE}}function Q(A){n.enabled!==!1&&A.preventDefault()}function ie(A){T.push(A)}function ge(A){delete k[A.pointerId];for(let j=0;j<T.length;j++)if(T[j].pointerId==A.pointerId){T.splice(j,1);return}}function se(A){let j=k[A.pointerId];j===void 0&&(j=new me,k[A.pointerId]=j),j.set(A.pageX,A.pageY)}function z(A){let j=A.pointerId===T[0].pointerId?T[1]:T[0];return k[j.pointerId]}n.domElement.addEventListener("contextmenu",Q),n.domElement.addEventListener("pointerdown",Ie),n.domElement.addEventListener("pointercancel",Ve),n.domElement.addEventListener("wheel",b,{passive:!1}),this.update()}};var ll={name:"CopyShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`};var yn=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error("THREE.Pass: .render() must be implemented in derived pass.")}dispose(){}},Zp=new Ji(-1,1,1,-1,0,1),Ya=new Ot;Ya.setAttribute("position",new mt([-1,3,0,-1,-1,0,3,-1,0],3));Ya.setAttribute("uv",new mt([0,2,0,0,2,0],2));var sr=class{constructor(e){this._mesh=new Ge(Ya,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,Zp)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}};var Ci=class extends yn{constructor(e,t){super(),this.textureID=t!==void 0?t:"tDiffuse",e instanceof Bt?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=Ua.clone(e.uniforms),this.material=new Bt({name:e.name!==void 0?e.name:"unspecified",defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this.fsQuad=new sr(this.material)}render(e,t,n){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=n.texture),this.fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this.fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this.fsQuad.render(e))}dispose(){this.material.dispose(),this.fsQuad.dispose()}};var is=class extends yn{constructor(e,t){super(),this.scene=e,this.camera=t,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,t,n){let s=e.getContext(),r=e.state;r.buffers.color.setMask(!1),r.buffers.depth.setMask(!1),r.buffers.color.setLocked(!0),r.buffers.depth.setLocked(!0);let o,a;this.inverse?(o=0,a=1):(o=1,a=0),r.buffers.stencil.setTest(!0),r.buffers.stencil.setOp(s.REPLACE,s.REPLACE,s.REPLACE),r.buffers.stencil.setFunc(s.ALWAYS,o,4294967295),r.buffers.stencil.setClear(a),r.buffers.stencil.setLocked(!0),e.setRenderTarget(n),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(t),this.clear&&e.clear(),e.render(this.scene,this.camera),r.buffers.color.setLocked(!1),r.buffers.depth.setLocked(!1),r.buffers.color.setMask(!0),r.buffers.depth.setMask(!0),r.buffers.stencil.setLocked(!1),r.buffers.stencil.setFunc(s.EQUAL,1,4294967295),r.buffers.stencil.setOp(s.KEEP,s.KEEP,s.KEEP),r.buffers.stencil.setLocked(!0)}},rr=class extends yn{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}};var ar=class{constructor(e,t){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),t===void 0){let n=e.getSize(new me);this._width=n.width,this._height=n.height,t=new Ut(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:Wn}),t.texture.name="EffectComposer.rt1"}else this._width=t.width,this._height=t.height;this.renderTarget1=t,this.renderTarget2=t.clone(),this.renderTarget2.texture.name="EffectComposer.rt2",this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new Ci(ll),this.copyPass.material.blending=nn,this.clock=new Ai}swapBuffers(){let e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,t){this.passes.splice(t,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){let t=this.passes.indexOf(e);t!==-1&&this.passes.splice(t,1)}isLastEnabledPass(e){for(let t=e+1;t<this.passes.length;t++)if(this.passes[t].enabled)return!1;return!0}render(e){e===void 0&&(e=this.clock.getDelta());let t=this.renderer.getRenderTarget(),n=!1;for(let s=0,r=this.passes.length;s<r;s++){let o=this.passes[s];if(o.enabled!==!1){if(o.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(s),o.render(this.renderer,this.writeBuffer,this.readBuffer,e,n),o.needsSwap){if(n){let a=this.renderer.getContext(),l=this.renderer.state.buffers.stencil;l.setFunc(a.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),l.setFunc(a.EQUAL,1,4294967295)}this.swapBuffers()}is!==void 0&&(o instanceof is?n=!0:o instanceof rr&&(n=!1))}}this.renderer.setRenderTarget(t)}reset(e){if(e===void 0){let t=this.renderer.getSize(new me);this._pixelRatio=this.renderer.getPixelRatio(),this._width=t.width,this._height=t.height,e=this.renderTarget1.clone(),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,t){this._width=e,this._height=t;let n=this._width*this._pixelRatio,s=this._height*this._pixelRatio;this.renderTarget1.setSize(n,s),this.renderTarget2.setSize(n,s);for(let r=0;r<this.passes.length;r++)this.passes[r].setSize(n,s)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}};var or=class extends yn{constructor(e,t,n=null,s=null,r=null){super(),this.scene=e,this.camera=t,this.overrideMaterial=n,this.clearColor=s,this.clearAlpha=r,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this._oldClearColor=new ze}render(e,t,n){let s=e.autoClear;e.autoClear=!1;let r,o;this.overrideMaterial!==null&&(o=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor)),this.clearAlpha!==null&&(r=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==!0&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:n),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(r),this.overrideMaterial!==null&&(this.scene.overrideMaterial=o),e.autoClear=s}};var cl={uniforms:{tDiffuse:{value:null},resolution:{value:new me(1/1024,1/512)}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`
	precision highp float;

	uniform sampler2D tDiffuse;

	uniform vec2 resolution;

	varying vec2 vUv;

	// FXAA 3.11 implementation by NVIDIA, ported to WebGL by Agost Biro (biro@archilogic.com)

	//----------------------------------------------------------------------------------
	// File:        es3-keplerFXAAassetsshaders/FXAA_DefaultES.frag
	// SDK Version: v3.00
	// Email:       gameworks@nvidia.com
	// Site:        http://developer.nvidia.com/
	//
	// Copyright (c) 2014-2015, NVIDIA CORPORATION. All rights reserved.
	//
	// Redistribution and use in source and binary forms, with or without
	// modification, are permitted provided that the following conditions
	// are met:
	//  * Redistributions of source code must retain the above copyright
	//    notice, this list of conditions and the following disclaimer.
	//  * Redistributions in binary form must reproduce the above copyright
	//    notice, this list of conditions and the following disclaimer in the
	//    documentation and/or other materials provided with the distribution.
	//  * Neither the name of NVIDIA CORPORATION nor the names of its
	//    contributors may be used to endorse or promote products derived
	//    from this software without specific prior written permission.
	//
	// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS ''AS IS'' AND ANY
	// EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
	// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
	// PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE COPYRIGHT OWNER OR
	// CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
	// EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
	// PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
	// PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
	// OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
	// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
	// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
	//
	//----------------------------------------------------------------------------------

	#ifndef FXAA_DISCARD
			//
			// Only valid for PC OpenGL currently.
			// Probably will not work when FXAA_GREEN_AS_LUMA = 1.
			//
			// 1 = Use discard on pixels which don't need AA.
			//     For APIs which enable concurrent TEX+ROP from same surface.
			// 0 = Return unchanged color on pixels which don't need AA.
			//
			#define FXAA_DISCARD 0
	#endif

	/*--------------------------------------------------------------------------*/
	#define FxaaTexTop(t, p) texture2D(t, p, -100.0)
	#define FxaaTexOff(t, p, o, r) texture2D(t, p + (o * r), -100.0)
	/*--------------------------------------------------------------------------*/

	#define NUM_SAMPLES 5

	// assumes colors have premultipliedAlpha, so that the calculated color contrast is scaled by alpha
	float contrast( vec4 a, vec4 b ) {
			vec4 diff = abs( a - b );
			return max( max( max( diff.r, diff.g ), diff.b ), diff.a );
	}

	/*============================================================================

									FXAA3 QUALITY - PC

	============================================================================*/

	/*--------------------------------------------------------------------------*/
	vec4 FxaaPixelShader(
			vec2 posM,
			sampler2D tex,
			vec2 fxaaQualityRcpFrame,
			float fxaaQualityEdgeThreshold,
			float fxaaQualityinvEdgeThreshold
	) {
			vec4 rgbaM = FxaaTexTop(tex, posM);
			vec4 rgbaS = FxaaTexOff(tex, posM, vec2( 0.0, 1.0), fxaaQualityRcpFrame.xy);
			vec4 rgbaE = FxaaTexOff(tex, posM, vec2( 1.0, 0.0), fxaaQualityRcpFrame.xy);
			vec4 rgbaN = FxaaTexOff(tex, posM, vec2( 0.0,-1.0), fxaaQualityRcpFrame.xy);
			vec4 rgbaW = FxaaTexOff(tex, posM, vec2(-1.0, 0.0), fxaaQualityRcpFrame.xy);
			// . S .
			// W M E
			// . N .

			bool earlyExit = max( max( max(
					contrast( rgbaM, rgbaN ),
					contrast( rgbaM, rgbaS ) ),
					contrast( rgbaM, rgbaE ) ),
					contrast( rgbaM, rgbaW ) )
					< fxaaQualityEdgeThreshold;
			// . 0 .
			// 0 0 0
			// . 0 .

			#if (FXAA_DISCARD == 1)
					if(earlyExit) FxaaDiscard;
			#else
					if(earlyExit) return rgbaM;
			#endif

			float contrastN = contrast( rgbaM, rgbaN );
			float contrastS = contrast( rgbaM, rgbaS );
			float contrastE = contrast( rgbaM, rgbaE );
			float contrastW = contrast( rgbaM, rgbaW );

			float relativeVContrast = ( contrastN + contrastS ) - ( contrastE + contrastW );
			relativeVContrast *= fxaaQualityinvEdgeThreshold;

			bool horzSpan = relativeVContrast > 0.;
			// . 1 .
			// 0 0 0
			// . 1 .

			// 45 deg edge detection and corners of objects, aka V/H contrast is too similar
			if( abs( relativeVContrast ) < .3 ) {
					// locate the edge
					vec2 dirToEdge;
					dirToEdge.x = contrastE > contrastW ? 1. : -1.;
					dirToEdge.y = contrastS > contrastN ? 1. : -1.;
					// . 2 .      . 1 .
					// 1 0 2  ~=  0 0 1
					// . 1 .      . 0 .

					// tap 2 pixels and see which ones are "outside" the edge, to
					// determine if the edge is vertical or horizontal

					vec4 rgbaAlongH = FxaaTexOff(tex, posM, vec2( dirToEdge.x, -dirToEdge.y ), fxaaQualityRcpFrame.xy);
					float matchAlongH = contrast( rgbaM, rgbaAlongH );
					// . 1 .
					// 0 0 1
					// . 0 H

					vec4 rgbaAlongV = FxaaTexOff(tex, posM, vec2( -dirToEdge.x, dirToEdge.y ), fxaaQualityRcpFrame.xy);
					float matchAlongV = contrast( rgbaM, rgbaAlongV );
					// V 1 .
					// 0 0 1
					// . 0 .

					relativeVContrast = matchAlongV - matchAlongH;
					relativeVContrast *= fxaaQualityinvEdgeThreshold;

					if( abs( relativeVContrast ) < .3 ) { // 45 deg edge
							// 1 1 .
							// 0 0 1
							// . 0 1

							// do a simple blur
							return mix(
									rgbaM,
									(rgbaN + rgbaS + rgbaE + rgbaW) * .25,
									.4
							);
					}

					horzSpan = relativeVContrast > 0.;
			}

			if(!horzSpan) rgbaN = rgbaW;
			if(!horzSpan) rgbaS = rgbaE;
			// . 0 .      1
			// 1 0 1  ->  0
			// . 0 .      1

			bool pairN = contrast( rgbaM, rgbaN ) > contrast( rgbaM, rgbaS );
			if(!pairN) rgbaN = rgbaS;

			vec2 offNP;
			offNP.x = (!horzSpan) ? 0.0 : fxaaQualityRcpFrame.x;
			offNP.y = ( horzSpan) ? 0.0 : fxaaQualityRcpFrame.y;

			bool doneN = false;
			bool doneP = false;

			float nDist = 0.;
			float pDist = 0.;

			vec2 posN = posM;
			vec2 posP = posM;

			int iterationsUsed = 0;
			int iterationsUsedN = 0;
			int iterationsUsedP = 0;
			for( int i = 0; i < NUM_SAMPLES; i++ ) {
					iterationsUsed = i;

					float increment = float(i + 1);

					if(!doneN) {
							nDist += increment;
							posN = posM + offNP * nDist;
							vec4 rgbaEndN = FxaaTexTop(tex, posN.xy);
							doneN = contrast( rgbaEndN, rgbaM ) > contrast( rgbaEndN, rgbaN );
							iterationsUsedN = i;
					}

					if(!doneP) {
							pDist += increment;
							posP = posM - offNP * pDist;
							vec4 rgbaEndP = FxaaTexTop(tex, posP.xy);
							doneP = contrast( rgbaEndP, rgbaM ) > contrast( rgbaEndP, rgbaN );
							iterationsUsedP = i;
					}

					if(doneN || doneP) break;
			}


			if ( !doneP && !doneN ) return rgbaM; // failed to find end of edge

			float dist = min(
					doneN ? float( iterationsUsedN ) / float( NUM_SAMPLES - 1 ) : 1.,
					doneP ? float( iterationsUsedP ) / float( NUM_SAMPLES - 1 ) : 1.
			);

			// hacky way of reduces blurriness of mostly diagonal edges
			// but reduces AA quality
			dist = pow(dist, .5);

			dist = 1. - dist;

			return mix(
					rgbaM,
					rgbaN,
					dist * .5
			);
	}

	void main() {
			const float edgeDetectionQuality = .2;
			const float invEdgeDetectionQuality = 1. / edgeDetectionQuality;

			gl_FragColor = FxaaPixelShader(
					vUv,
					tDiffuse,
					resolution,
					edgeDetectionQuality, // [0,1] contrast needed, otherwise early discard
					invEdgeDetectionQuality
			);

	}
	`};var Za=class{constructor(){Object.defineProperty(this,"speed",{enumerable:!0,configurable:!0,writable:!0,value:1}),Object.defineProperty(this,"paused",{enumerable:!0,configurable:!0,writable:!0,value:!1}),Object.defineProperty(this,"progress",{enumerable:!0,configurable:!0,writable:!0,value:0}),Object.defineProperty(this,"currentId",{enumerable:!0,configurable:!0,writable:!0,value:0}),Object.defineProperty(this,"progress0",{enumerable:!0,configurable:!0,writable:!0,value:new Map}),Object.defineProperty(this,"animationObjects",{enumerable:!0,configurable:!0,writable:!0,value:new Map})}update(e,t){if(this.paused)return;let n=t*this.speed;this.animate(e,n),this.animationObjects.forEach((s,r)=>{let o=this.progress0.get(r);s(e,this.progress-o,r)}),this.progress+=n}addAnimation(e){let t=this.currentId++;return this.progress0.set(t,this.progress),this.animationObjects.set(t,e),t}removeAnimation(e){e!=null&&(this.animationObjects.delete(e),this.progress0.delete(e))}};var lr=class extends Za{animate(e){let t=this.progress*2,n=Math.PI*.02;e.skin.leftArm.rotation.z=Math.cos(t)*.03+n,e.skin.rightArm.rotation.z=Math.cos(t+Math.PI)*.03-n;let s=Math.PI*.06;e.cape.rotation.x=Math.sin(t)*.01+s}};var cr=class extends Vt{constructor(e="",t={}){let n=new kt({transparent:!0,alphaTest:1e-5});super(n),Object.defineProperty(this,"painted",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"text",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"font",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"margin",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"textStyle",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"backgroundStyle",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"height",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"textMaterial",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),this.textMaterial=n,this.text=e,this.font=t.font===void 0?"48px Minecraft":t.font,this.margin=t.margin===void 0?[5,10,5,10]:t.margin,this.textStyle=t.textStyle===void 0?"white":t.textStyle,this.backgroundStyle=t.backgroundStyle===void 0?"rgba(0,0,0,.25)":t.backgroundStyle,this.height=t.height===void 0?4:t.height,(t.repaintAfterLoaded===void 0?!0:t.repaintAfterLoaded)&&!document.fonts.check(this.font,this.text)?(this.paint(),this.painted=this.loadAndPaint()):(this.paint(),this.painted=Promise.resolve())}async loadAndPaint(){await document.fonts.load(this.font,this.text),this.paint()}paint(){let e=document.createElement("canvas"),t=e.getContext("2d");t.font=this.font;let n=t.measureText(this.text);e.width=this.margin[3]+n.actualBoundingBoxLeft+n.actualBoundingBoxRight+this.margin[1],e.height=this.margin[0]+n.actualBoundingBoxAscent+n.actualBoundingBoxDescent+this.margin[2],t=e.getContext("2d"),t.font=this.font,t.fillStyle=this.backgroundStyle,t.fillRect(0,0,e.width,e.height),t.fillStyle=this.textStyle,t.fillText(this.text,this.margin[3]+n.actualBoundingBoxLeft,this.margin[0]+n.actualBoundingBoxAscent);let s=new an(e);s.magFilter=He,s.minFilter=He,this.textMaterial.map=s,this.textMaterial.needsUpdate=!0,this.scale.x=e.width/e.height*this.height,this.scale.y=this.height}};var hr=class{constructor(e={}){Object.defineProperty(this,"canvas",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"scene",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"camera",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"renderer",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"controls",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"playerObject",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"playerWrapper",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"globalLight",{enumerable:!0,configurable:!0,writable:!0,value:new Js(16777215,3)}),Object.defineProperty(this,"cameraLight",{enumerable:!0,configurable:!0,writable:!0,value:new js(16777215,.6)}),Object.defineProperty(this,"composer",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"renderPass",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"fxaaPass",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"skinCanvas",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"capeCanvas",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"earsCanvas",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"skinTexture",{enumerable:!0,configurable:!0,writable:!0,value:null}),Object.defineProperty(this,"capeTexture",{enumerable:!0,configurable:!0,writable:!0,value:null}),Object.defineProperty(this,"earsTexture",{enumerable:!0,configurable:!0,writable:!0,value:null}),Object.defineProperty(this,"backgroundTexture",{enumerable:!0,configurable:!0,writable:!0,value:null}),Object.defineProperty(this,"_disposed",{enumerable:!0,configurable:!0,writable:!0,value:!1}),Object.defineProperty(this,"_renderPaused",{enumerable:!0,configurable:!0,writable:!0,value:!1}),Object.defineProperty(this,"_zoom",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"isUserRotating",{enumerable:!0,configurable:!0,writable:!0,value:!1}),Object.defineProperty(this,"autoRotate",{enumerable:!0,configurable:!0,writable:!0,value:!1}),Object.defineProperty(this,"autoRotateSpeed",{enumerable:!0,configurable:!0,writable:!0,value:1}),Object.defineProperty(this,"_animation",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"clock",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"animationID",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"onContextLost",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"onContextRestored",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"_pixelRatio",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"devicePixelRatioQuery",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"onDevicePixelRatioChange",{enumerable:!0,configurable:!0,writable:!0,value:void 0}),Object.defineProperty(this,"_nameTag",{enumerable:!0,configurable:!0,writable:!0,value:null}),Object.defineProperty(this,"nameTagYOffset",{enumerable:!0,configurable:!0,writable:!0,value:20}),this.canvas=e.canvas===void 0?document.createElement("canvas"):e.canvas,this.skinCanvas=document.createElement("canvas"),this.capeCanvas=document.createElement("canvas"),this.earsCanvas=document.createElement("canvas"),this.scene=new qs,this.camera=new yt,this.camera.add(this.cameraLight),this.scene.add(this.camera),this.scene.add(this.globalLight),Lt.enabled=!1,this.renderer=new Ki({canvas:this.canvas,preserveDrawingBuffer:e.preserveDrawingBuffer===!0}),this.onDevicePixelRatioChange=()=>{this.renderer.setPixelRatio(window.devicePixelRatio),this.updateComposerSize(),this._pixelRatio==="match-device"&&(this.devicePixelRatioQuery=matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`),this.devicePixelRatioQuery.addEventListener("change",this.onDevicePixelRatioChange,{once:!0}))},e.pixelRatio===void 0||e.pixelRatio==="match-device"?(this._pixelRatio="match-device",this.devicePixelRatioQuery=matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`),this.devicePixelRatioQuery.addEventListener("change",this.onDevicePixelRatioChange,{once:!0}),this.renderer.setPixelRatio(window.devicePixelRatio)):(this._pixelRatio=e.pixelRatio,this.devicePixelRatioQuery=null,this.renderer.setPixelRatio(e.pixelRatio)),this.renderer.setClearColor(0,0);let t;this.renderer.capabilities.isWebGL2&&(t=new Ut(0,0,{depthTexture:new $i(0,0,tn)})),this.composer=new ar(this.renderer,t),this.renderPass=new or(this.scene,this.camera),this.fxaaPass=new Ci(cl),this.composer.addPass(this.renderPass),this.composer.addPass(this.fxaaPass),this.playerObject=new er,this.playerObject.name="player",this.playerObject.skin.visible=!1,this.playerObject.cape.visible=!1,this.playerWrapper=new Je,this.playerWrapper.add(this.playerObject),this.scene.add(this.playerWrapper),this.controls=new ir(this.camera,this.canvas),this.controls.enablePan=!1,this.controls.minDistance=10,this.controls.maxDistance=256,e.enableControls===!1&&(this.controls.enabled=!1),e.skin!==void 0&&this.loadSkin(e.skin,{model:e.model,ears:e.ears==="current-skin"}),e.cape!==void 0&&this.loadCape(e.cape),e.ears!==void 0&&e.ears!=="current-skin"&&this.loadEars(e.ears.source,{textureType:e.ears.textureType}),e.width!==void 0&&(this.width=e.width),e.height!==void 0&&(this.height=e.height),e.background!==void 0&&(this.background=e.background),e.panorama!==void 0&&this.loadPanorama(e.panorama),e.nameTag!==void 0&&(this.nameTag=e.nameTag),this.camera.position.z=1,this._zoom=e.zoom===void 0?.9:e.zoom,this.fov=e.fov===void 0?50:e.fov,this._animation=e.animation===void 0?null:e.animation,this.clock=new Ai,e.renderPaused===!0?(this._renderPaused=!0,this.animationID=null):this.animationID=window.requestAnimationFrame(()=>this.draw()),this.onContextLost=n=>{n.preventDefault(),this.animationID!==null&&(window.cancelAnimationFrame(this.animationID),this.animationID=null)},this.onContextRestored=()=>{this.renderer.setClearColor(0,0),!this._renderPaused&&!this._disposed&&this.animationID===null&&(this.animationID=window.requestAnimationFrame(()=>this.draw()))},this.canvas.addEventListener("webglcontextlost",this.onContextLost,!1),this.canvas.addEventListener("webglcontextrestored",this.onContextRestored,!1),this.canvas.addEventListener("mousedown",()=>{this.isUserRotating=!0},!1),this.canvas.addEventListener("mouseup",()=>{this.isUserRotating=!1},!1),this.canvas.addEventListener("touchmove",n=>{n.touches.length===1?this.isUserRotating=!0:this.isUserRotating=!1},!1),this.canvas.addEventListener("touchend",()=>{this.isUserRotating=!1},!1)}updateComposerSize(){this.composer.setSize(this.width,this.height);let e=this.renderer.getPixelRatio();this.composer.setPixelRatio(e),this.fxaaPass.material.uniforms.resolution.value.x=1/(this.width*e),this.fxaaPass.material.uniforms.resolution.value.y=1/(this.height*e)}recreateSkinTexture(){this.skinTexture!==null&&this.skinTexture.dispose(),this.skinTexture=new an(this.skinCanvas),this.skinTexture.magFilter=He,this.skinTexture.minFilter=He,this.playerObject.skin.map=this.skinTexture}recreateCapeTexture(){this.capeTexture!==null&&this.capeTexture.dispose(),this.capeTexture=new an(this.capeCanvas),this.capeTexture.magFilter=He,this.capeTexture.minFilter=He,this.playerObject.cape.map=this.capeTexture,this.playerObject.elytra.map=this.capeTexture}recreateEarsTexture(){this.earsTexture!==null&&this.earsTexture.dispose(),this.earsTexture=new an(this.earsCanvas),this.earsTexture.magFilter=He,this.earsTexture.minFilter=He,this.playerObject.ears.map=this.earsTexture}loadSkin(e,t={}){if(e===null)this.resetSkin();else if(ts(e))tl(this.skinCanvas,e),this.recreateSkinTexture(),t.model===void 0||t.model==="auto-detect"?this.playerObject.skin.modelType=il(this.skinCanvas):this.playerObject.skin.modelType=t.model,t.makeVisible!==!1&&(this.playerObject.skin.visible=!0),(t.ears===!0||t.ears=="load-only")&&(Xa(this.earsCanvas,e),this.recreateEarsTexture(),t.ears===!0&&(this.playerObject.ears.visible=!0,this._nameTag&&(this.nameTagYOffset=25,this._nameTag.position.y=this.nameTagYOffset)));else return ns(e).then(n=>this.loadSkin(n,t))}resetSkin(){this.playerObject.skin.visible=!1,this.playerObject.skin.map=null,this.skinTexture!==null&&(this.skinTexture.dispose(),this.skinTexture=null)}loadCape(e,t={}){if(e===null)this.resetCape();else if(ts(e))nl(this.capeCanvas,e),this.recreateCapeTexture(),t.makeVisible!==!1&&(this.playerObject.backEquipment=t.backEquipment===void 0?"cape":t.backEquipment);else return ns(e).then(n=>this.loadCape(n,t))}resetCape(){this.playerObject.backEquipment=null,this.playerObject.cape.map=null,this.playerObject.elytra.map=null,this.capeTexture!==null&&(this.capeTexture.dispose(),this.capeTexture=null)}loadEars(e,t={}){if(e===null)this.resetEars();else if(ts(e))t.textureType==="skin"?Xa(this.earsCanvas,e):sl(this.earsCanvas,e),this.recreateEarsTexture(),t.makeVisible!==!1&&(this.playerObject.ears.visible=!0,this._nameTag&&(this.nameTagYOffset=25,this._nameTag.position.y=this.nameTagYOffset));else return ns(e).then(n=>this.loadEars(n,t))}resetEars(){this.playerObject.ears.visible=!1,this._nameTag&&(this.nameTagYOffset=20,this._nameTag.position.y=this.nameTagYOffset),this.playerObject.ears.map=null,this.earsTexture!==null&&(this.earsTexture.dispose(),this.earsTexture=null)}loadPanorama(e){return this.loadBackground(e,Wi)}loadBackground(e,t){if(ts(e))this.backgroundTexture!==null&&this.backgroundTexture.dispose(),this.backgroundTexture=new ft,this.backgroundTexture.image=e,t!==void 0&&(this.backgroundTexture.mapping=t),this.backgroundTexture.needsUpdate=!0,this.scene.background=this.backgroundTexture;else return ns(e).then(n=>this.loadBackground(n,t))}draw(){let e=this.clock.getDelta();this._animation!==null&&(this._animation.update(this.playerObject,e),this._nameTag&&(this._nameTag.position.y=this.playerObject.skin.head.getWorldPosition(new L).y+this.nameTagYOffset-8)),this.autoRotate&&(this.controls.enableRotate&&this.isUserRotating||(this.playerWrapper.rotation.y+=e*this.autoRotateSpeed)),this.controls.update(),this.render(),this.animationID=window.requestAnimationFrame(()=>this.draw())}render(){this.composer.render()}setSize(e,t){this.camera.aspect=e/t,this.camera.updateProjectionMatrix(),this.renderer.setSize(e,t),this.updateComposerSize()}dispose(){this._disposed=!0,this.canvas.removeEventListener("webglcontextlost",this.onContextLost,!1),this.canvas.removeEventListener("webglcontextrestored",this.onContextRestored,!1),this.devicePixelRatioQuery!==null&&(this.devicePixelRatioQuery.removeEventListener("change",this.onDevicePixelRatioChange),this.devicePixelRatioQuery=null),this.animationID!==null&&(window.cancelAnimationFrame(this.animationID),this.animationID=null),this.controls.dispose(),this.renderer.dispose(),this.resetSkin(),this.resetCape(),this.resetEars(),this.background=null,this.fxaaPass.fsQuad.dispose()}get disposed(){return this._disposed}get renderPaused(){return this._renderPaused}set renderPaused(e){this._renderPaused=e,this._renderPaused&&this.animationID!==null?(window.cancelAnimationFrame(this.animationID),this.animationID=null,this.clock.stop(),this.clock.autoStart=!0):!this._renderPaused&&!this._disposed&&!this.renderer.getContext().isContextLost()&&this.animationID==null&&(this.animationID=window.requestAnimationFrame(()=>this.draw()))}get width(){return this.renderer.getSize(new me).width}set width(e){this.setSize(e,this.height)}get height(){return this.renderer.getSize(new me).height}set height(e){this.setSize(this.width,e)}get background(){return this.scene.background}set background(e){e===null||e instanceof ze||e instanceof ft?this.scene.background=e:this.scene.background=new ze(e),this.backgroundTexture!==null&&e!==this.backgroundTexture&&(this.backgroundTexture.dispose(),this.backgroundTexture=null)}adjustCameraDistance(){let e=4.5+16.5/Math.tan(this.fov/180*Math.PI/2)/this.zoom;e<10?e=10:e>256&&(e=256),this.camera.position.multiplyScalar(e/this.camera.position.length()),this.camera.updateProjectionMatrix()}resetCameraPose(){this.camera.position.set(0,0,1),this.camera.rotation.set(0,0,0),this.adjustCameraDistance()}get fov(){return this.camera.fov}set fov(e){this.camera.fov=e,this.adjustCameraDistance()}get zoom(){return this._zoom}set zoom(e){this._zoom=e,this.adjustCameraDistance()}get pixelRatio(){return this._pixelRatio}set pixelRatio(e){e==="match-device"?this._pixelRatio!=="match-device"&&(this._pixelRatio=e,this.onDevicePixelRatioChange()):(this._pixelRatio==="match-device"&&this.devicePixelRatioQuery!==null&&(this.devicePixelRatioQuery.removeEventListener("change",this.onDevicePixelRatioChange),this.devicePixelRatioQuery=null),this._pixelRatio=e,this.renderer.setPixelRatio(e),this.updateComposerSize())}get animation(){return this._animation}set animation(e){this._animation!==e&&(this.playerObject.resetJoints(),this.playerObject.position.set(0,0,0),this.playerObject.rotation.set(0,0,0),this._nameTag&&(this._nameTag.position.y=this.nameTagYOffset),this.clock.stop(),this.clock.autoStart=!0),e!==null&&(e.progress=0),this._animation=e}get nameTag(){return this._nameTag}set nameTag(e){this._nameTag!==null&&this.playerWrapper.remove(this._nameTag),e!==null&&(e instanceof Et||(e=new cr(e)),this.playerWrapper.add(e),this.nameTagYOffset=this.playerObject.ears.visible?25:20,e.position.y=this.nameTagYOffset),this._nameTag=e}};var hl={allay:{name:"root",pose:[0,0,0,0,0,0],quads:[],children:[{name:"root",pose:[0,23.5,0,0,0,0],quads:[],children:[{name:"head",pose:[0,-3.99,0,0,0,0],quads:[[2.5,-5,2.5,.3125,0,-2.5,-5,2.5,.1563,0,-2.5,-5,-2.5,.1563,.1563,2.5,-5,-2.5,.3125,.1563],[2.5,0,-2.5,.4688,.1563,-2.5,0,-2.5,.3125,.1563,-2.5,0,2.5,.3125,0,2.5,0,2.5,.4688,0],[-2.5,-5,-2.5,.1563,.1563,-2.5,-5,2.5,0,.1563,-2.5,0,2.5,0,.3125,-2.5,0,-2.5,.1563,.3125],[2.5,-5,-2.5,.3125,.1563,-2.5,-5,-2.5,.1563,.1563,-2.5,0,-2.5,.1563,.3125,2.5,0,-2.5,.3125,.3125],[2.5,-5,2.5,.4688,.1563,2.5,-5,-2.5,.3125,.1563,2.5,0,-2.5,.3125,.3125,2.5,0,2.5,.4688,.3125],[-2.5,-5,2.5,.625,.1563,2.5,-5,2.5,.4688,.1563,2.5,0,2.5,.4688,.3125,-2.5,0,2.5,.625,.3125]],children:[]},{name:"body",pose:[0,-4,0,0,0,0],quads:[[1.5,0,1,.1563,.3125,-1.5,0,1,.0625,.3125,-1.5,0,-1,.0625,.375,1.5,0,-1,.1563,.375],[1.5,4,-1,.25,.375,-1.5,4,-1,.1563,.375,-1.5,4,1,.1563,.3125,1.5,4,1,.25,.3125],[-1.5,0,-1,.0625,.375,-1.5,0,1,0,.375,-1.5,4,1,0,.5,-1.5,4,-1,.0625,.5],[1.5,0,-1,.1563,.375,-1.5,0,-1,.0625,.375,-1.5,4,-1,.0625,.5,1.5,4,-1,.1563,.5],[1.5,0,1,.2188,.375,1.5,0,-1,.1563,.375,1.5,4,-1,.1563,.5,1.5,4,1,.2188,.5],[-1.5,0,1,.3125,.375,1.5,0,1,.2188,.375,1.5,4,1,.2188,.5,-1.5,4,1,.3125,.5],[1.3,.2,.8,.1563,.5,-1.3,.2,.8,.0625,.5,-1.3,.2,-.8,.0625,.5625,1.3,.2,-.8,.1563,.5625],[1.3,4.8,-.8,.25,.5625,-1.3,4.8,-.8,.1563,.5625,-1.3,4.8,.8,.1563,.5,1.3,4.8,.8,.25,.5],[-1.3,.2,-.8,.0625,.5625,-1.3,.2,.8,0,.5625,-1.3,4.8,.8,0,.7188,-1.3,4.8,-.8,.0625,.7188],[1.3,.2,-.8,.1563,.5625,-1.3,.2,-.8,.0625,.5625,-1.3,4.8,-.8,.0625,.7188,1.3,4.8,-.8,.1563,.7188],[1.3,.2,.8,.2188,.5625,1.3,.2,-.8,.1563,.5625,1.3,4.8,-.8,.1563,.7188,1.3,4.8,.8,.2188,.7188],[-1.3,.2,.8,.3125,.5625,1.3,.2,.8,.2188,.5625,1.3,4.8,.8,.2188,.7188,-1.3,4.8,.8,.3125,.7188]],children:[{name:"right_arm",pose:[-1.75,.5,0,0,0,0],quads:[[.24,-.49,.99,.8125,0,-.74,-.49,.99,.7813,0,-.74,-.49,-.99,.7813,.0625,.24,-.49,-.99,.8125,.0625],[.24,3.49,-.99,.8438,.0625,-.74,3.49,-.99,.8125,.0625,-.74,3.49,.99,.8125,0,.24,3.49,.99,.8438,0],[-.74,-.49,-.99,.7813,.0625,-.74,-.49,.99,.7188,.0625,-.74,3.49,.99,.7188,.1875,-.74,3.49,-.99,.7813,.1875],[.24,-.49,-.99,.8125,.0625,-.74,-.49,-.99,.7813,.0625,-.74,3.49,-.99,.7813,.1875,.24,3.49,-.99,.8125,.1875],[.24,-.49,.99,.875,.0625,.24,-.49,-.99,.8125,.0625,.24,3.49,-.99,.8125,.1875,.24,3.49,.99,.875,.1875],[-.74,-.49,.99,.9063,.0625,.24,-.49,.99,.875,.0625,.24,3.49,.99,.875,.1875,-.74,3.49,.99,.9063,.1875]],children:[]},{name:"left_arm",pose:[1.75,.5,0,0,0,0],quads:[[.74,-.49,.99,.8125,.1875,-.24,-.49,.99,.7813,.1875,-.24,-.49,-.99,.7813,.25,.74,-.49,-.99,.8125,.25],[.74,3.49,-.99,.8438,.25,-.24,3.49,-.99,.8125,.25,-.24,3.49,.99,.8125,.1875,.74,3.49,.99,.8438,.1875],[-.24,-.49,-.99,.7813,.25,-.24,-.49,.99,.7188,.25,-.24,3.49,.99,.7188,.375,-.24,3.49,-.99,.7813,.375],[.74,-.49,-.99,.8125,.25,-.24,-.49,-.99,.7813,.25,-.24,3.49,-.99,.7813,.375,.74,3.49,-.99,.8125,.375],[.74,-.49,.99,.875,.25,.74,-.49,-.99,.8125,.25,.74,3.49,-.99,.8125,.375,.74,3.49,.99,.875,.375],[-.24,-.49,.99,.9063,.25,.74,-.49,.99,.875,.25,.74,3.49,.99,.875,.375,-.24,3.49,.99,.9063,.375]],children:[]},{name:"right_wing",pose:[-.5,0,.6,0,0,0],quads:[[0,1,8,.75,.4375,0,1,8,.75,.4375,0,1,0,.75,.6875,0,1,0,.75,.6875],[0,6,0,.75,.6875,0,6,0,.75,.6875,0,6,8,.75,.4375,0,6,8,.75,.4375],[0,1,0,.75,.6875,0,1,8,.5,.6875,0,6,8,.5,.8438,0,6,0,.75,.8438],[0,1,0,.75,.6875,0,1,0,.75,.6875,0,6,0,.75,.8438,0,6,0,.75,.8438],[0,1,8,1,.6875,0,1,0,.75,.6875,0,6,0,.75,.8438,0,6,8,1,.8438],[0,1,8,1,.6875,0,1,8,1,.6875,0,6,8,1,.8438,0,6,8,1,.8438]],children:[]},{name:"left_wing",pose:[.5,0,.6,0,0,0],quads:[[0,1,8,.75,.4375,0,1,8,.75,.4375,0,1,0,.75,.6875,0,1,0,.75,.6875],[0,6,0,.75,.6875,0,6,0,.75,.6875,0,6,8,.75,.4375,0,6,8,.75,.4375],[0,1,0,.75,.6875,0,1,8,.5,.6875,0,6,8,.5,.8438,0,6,0,.75,.8438],[0,1,0,.75,.6875,0,1,0,.75,.6875,0,6,0,.75,.8438,0,6,0,.75,.8438],[0,1,8,1,.6875,0,1,0,.75,.6875,0,6,0,.75,.8438,0,6,8,1,.8438],[0,1,8,1,.6875,0,1,8,1,.6875,0,6,8,1,.8438,0,6,8,1,.8438]],children:[]}]}]}]},vex:{name:"root",pose:[0,0,0,0,0,0],quads:[],children:[{name:"root",pose:[0,-2.5,0,0,0,0],quads:[],children:[{name:"head",pose:[0,20,0,0,0,0],quads:[[2.5,-5,2.5,.3125,0,-2.5,-5,2.5,.1563,0,-2.5,-5,-2.5,.1563,.1563,2.5,-5,-2.5,.3125,.1563],[2.5,0,-2.5,.4688,.1563,-2.5,0,-2.5,.3125,.1563,-2.5,0,2.5,.3125,0,2.5,0,2.5,.4688,0],[-2.5,-5,-2.5,.1563,.1563,-2.5,-5,2.5,0,.1563,-2.5,0,2.5,0,.3125,-2.5,0,-2.5,.1563,.3125],[2.5,-5,-2.5,.3125,.1563,-2.5,-5,-2.5,.1563,.1563,-2.5,0,-2.5,.1563,.3125,2.5,0,-2.5,.3125,.3125],[2.5,-5,2.5,.4688,.1563,2.5,-5,-2.5,.3125,.1563,2.5,0,-2.5,.3125,.3125,2.5,0,2.5,.4688,.3125],[-2.5,-5,2.5,.625,.1563,2.5,-5,2.5,.4688,.1563,2.5,0,2.5,.4688,.3125,-2.5,0,2.5,.625,.3125]],children:[]},{name:"body",pose:[0,20,0,0,0,0],quads:[[1.5,0,1,.1563,.3125,-1.5,0,1,.0625,.3125,-1.5,0,-1,.0625,.375,1.5,0,-1,.1563,.375],[1.5,4,-1,.25,.375,-1.5,4,-1,.1563,.375,-1.5,4,1,.1563,.3125,1.5,4,1,.25,.3125],[-1.5,0,-1,.0625,.375,-1.5,0,1,0,.375,-1.5,4,1,0,.5,-1.5,4,-1,.0625,.5],[1.5,0,-1,.1563,.375,-1.5,0,-1,.0625,.375,-1.5,4,-1,.0625,.5,1.5,4,-1,.1563,.5],[1.5,0,1,.2188,.375,1.5,0,-1,.1563,.375,1.5,4,-1,.1563,.5,1.5,4,1,.2188,.5],[-1.5,0,1,.3125,.375,1.5,0,1,.2188,.375,1.5,4,1,.2188,.5,-1.5,4,1,.3125,.5],[1.3,1.2,.8,.1563,.5,-1.3,1.2,.8,.0625,.5,-1.3,1.2,-.8,.0625,.5625,1.3,1.2,-.8,.1563,.5625],[1.3,5.8,-.8,.25,.5625,-1.3,5.8,-.8,.1563,.5625,-1.3,5.8,.8,.1563,.5,1.3,5.8,.8,.25,.5],[-1.3,1.2,-.8,.0625,.5625,-1.3,1.2,.8,0,.5625,-1.3,5.8,.8,0,.7188,-1.3,5.8,-.8,.0625,.7188],[1.3,1.2,-.8,.1563,.5625,-1.3,1.2,-.8,.0625,.5625,-1.3,5.8,-.8,.0625,.7188,1.3,5.8,-.8,.1563,.7188],[1.3,1.2,.8,.2188,.5625,1.3,1.2,-.8,.1563,.5625,1.3,5.8,-.8,.1563,.7188,1.3,5.8,.8,.2188,.7188],[-1.3,1.2,.8,.3125,.5625,1.3,1.2,.8,.2188,.5625,1.3,5.8,.8,.2188,.7188,-1.3,5.8,.8,.3125,.7188]],children:[{name:"right_arm",pose:[-1.75,.25,0,0,0,0],quads:[[.65,-.4,.9,.8438,0,-1.15,-.4,.9,.7813,0,-1.15,-.4,-.9,.7813,.0625,.65,-.4,-.9,.8438,.0625],[.65,3.4,-.9,.9063,.0625,-1.15,3.4,-.9,.8438,.0625,-1.15,3.4,.9,.8438,0,.65,3.4,.9,.9063,0],[-1.15,-.4,-.9,.7813,.0625,-1.15,-.4,.9,.7188,.0625,-1.15,3.4,.9,.7188,.1875,-1.15,3.4,-.9,.7813,.1875],[.65,-.4,-.9,.8438,.0625,-1.15,-.4,-.9,.7813,.0625,-1.15,3.4,-.9,.7813,.1875,.65,3.4,-.9,.8438,.1875],[.65,-.4,.9,.9063,.0625,.65,-.4,-.9,.8438,.0625,.65,3.4,-.9,.8438,.1875,.65,3.4,.9,.9063,.1875],[-1.15,-.4,.9,.9688,.0625,.65,-.4,.9,.9063,.0625,.65,3.4,.9,.9063,.1875,-1.15,3.4,.9,.9688,.1875]],children:[]},{name:"left_arm",pose:[1.75,.25,0,0,0,0],quads:[[1.15,-.4,.9,.8438,.1875,-.65,-.4,.9,.7813,.1875,-.65,-.4,-.9,.7813,.25,1.15,-.4,-.9,.8438,.25],[1.15,3.4,-.9,.9063,.25,-.65,3.4,-.9,.8438,.25,-.65,3.4,.9,.8438,.1875,1.15,3.4,.9,.9063,.1875],[-.65,-.4,-.9,.7813,.25,-.65,-.4,.9,.7188,.25,-.65,3.4,.9,.7188,.375,-.65,3.4,-.9,.7813,.375],[1.15,-.4,-.9,.8438,.25,-.65,-.4,-.9,.7813,.25,-.65,3.4,-.9,.7813,.375,1.15,3.4,-.9,.8438,.375],[1.15,-.4,.9,.9063,.25,1.15,-.4,-.9,.8438,.25,1.15,3.4,-.9,.8438,.375,1.15,3.4,.9,.9063,.375],[-.65,-.4,.9,.9688,.25,1.15,-.4,.9,.9063,.25,1.15,3.4,.9,.9063,.375,-.65,3.4,.9,.9688,.375]],children:[]},{name:"right_wing",pose:[-.5,1,1,0,0,0],quads:[[0,0,8,.75,.4375,0,0,8,.75,.4375,0,0,0,.75,.6875,0,0,0,.75,.6875],[0,5,0,.75,.6875,0,5,0,.75,.6875,0,5,8,.75,.4375,0,5,8,.75,.4375],[0,0,0,.75,.6875,0,0,8,.5,.6875,0,5,8,.5,.8438,0,5,0,.75,.8438],[0,0,0,.75,.6875,0,0,0,.75,.6875,0,5,0,.75,.8438,0,5,0,.75,.8438],[0,0,8,1,.6875,0,0,0,.75,.6875,0,5,0,.75,.8438,0,5,8,1,.8438],[0,0,8,1,.6875,0,0,8,1,.6875,0,5,8,1,.8438,0,5,8,1,.8438]],children:[]},{name:"left_wing",pose:[.5,1,1,0,0,0],quads:[[0,0,0,.75,.6875,0,0,0,.75,.6875,0,0,8,.75,.4375,0,0,8,.75,.4375],[0,5,8,.75,.4375,0,5,8,.75,.4375,0,5,0,.75,.6875,0,5,0,.75,.6875],[0,5,0,.75,.8438,0,5,8,.5,.8438,0,0,8,.5,.6875,0,0,0,.75,.6875],[0,5,0,.75,.8438,0,5,0,.75,.8438,0,0,0,.75,.6875,0,0,0,.75,.6875],[0,5,8,1,.8438,0,5,0,.75,.8438,0,0,0,.75,.6875,0,0,8,1,.6875],[0,5,8,1,.8438,0,5,8,1,.8438,0,0,8,1,.6875,0,0,8,1,.6875]],children:[]}]}]}]},bat:{name:"root",pose:[0,0,0,0,0,0],quads:[],children:[{name:"head",pose:[0,17,0,0,0,0],quads:[[2,-3,1,.1875,.2188,-2,-3,1,.0625,.2188,-2,-3,-1,.0625,.2813,2,-3,-1,.1875,.2813],[2,0,-1,.3125,.2813,-2,0,-1,.1875,.2813,-2,0,1,.1875,.2188,2,0,1,.3125,.2188],[-2,-3,-1,.0625,.2813,-2,-3,1,0,.2813,-2,0,1,0,.375,-2,0,-1,.0625,.375],[2,-3,-1,.1875,.2813,-2,-3,-1,.0625,.2813,-2,0,-1,.0625,.375,2,0,-1,.1875,.375],[2,-3,1,.25,.2813,2,-3,-1,.1875,.2813,2,0,-1,.1875,.375,2,0,1,.25,.375],[-2,-3,1,.375,.2813,2,-3,1,.25,.2813,2,0,1,.25,.375,-2,0,1,.375,.375]],children:[{name:"right_ear",pose:[-1.5,-2,0,0,0,0],quads:[[.5,-4,0,.125,.4688,-2.5,-4,0,.0313,.4688,-2.5,-4,0,.0313,.4688,.5,-4,0,.125,.4688],[.5,1,0,.2188,.4688,-2.5,1,0,.125,.4688,-2.5,1,0,.125,.4688,.5,1,0,.2188,.4688],[-2.5,-4,0,.0313,.4688,-2.5,-4,0,.0313,.4688,-2.5,1,0,.0313,.625,-2.5,1,0,.0313,.625],[.5,-4,0,.125,.4688,-2.5,-4,0,.0313,.4688,-2.5,1,0,.0313,.625,.5,1,0,.125,.625],[.5,-4,0,.125,.4688,.5,-4,0,.125,.4688,.5,1,0,.125,.625,.5,1,0,.125,.625],[-2.5,-4,0,.2188,.4688,.5,-4,0,.125,.4688,.5,1,0,.125,.625,-2.5,1,0,.2188,.625]],children:[]},{name:"left_ear",pose:[1.1,-3,0,0,0,0],quads:[[2.9,-3,0,.3438,.4688,-.1,-3,0,.25,.4688,-.1,-3,0,.25,.4688,2.9,-3,0,.3438,.4688],[2.9,2,0,.4375,.4688,-.1,2,0,.3438,.4688,-.1,2,0,.3438,.4688,2.9,2,0,.4375,.4688],[-.1,-3,0,.25,.4688,-.1,-3,0,.25,.4688,-.1,2,0,.25,.625,-.1,2,0,.25,.625],[2.9,-3,0,.3438,.4688,-.1,-3,0,.25,.4688,-.1,2,0,.25,.625,2.9,2,0,.3438,.625],[2.9,-3,0,.3438,.4688,2.9,-3,0,.3438,.4688,2.9,2,0,.3438,.625,2.9,2,0,.3438,.625],[-.1,-3,0,.4375,.4688,2.9,-3,0,.3438,.4688,2.9,2,0,.3438,.625,-.1,2,0,.4375,.625]],children:[]}]},{name:"body",pose:[0,17,0,0,0,0],quads:[[1.5,0,1,.1563,0,-1.5,0,1,.0625,0,-1.5,0,-1,.0625,.0625,1.5,0,-1,.1563,.0625],[1.5,5,-1,.25,.0625,-1.5,5,-1,.1563,.0625,-1.5,5,1,.1563,0,1.5,5,1,.25,0],[-1.5,0,-1,.0625,.0625,-1.5,0,1,0,.0625,-1.5,5,1,0,.2188,-1.5,5,-1,.0625,.2188],[1.5,0,-1,.1563,.0625,-1.5,0,-1,.0625,.0625,-1.5,5,-1,.0625,.2188,1.5,5,-1,.1563,.2188],[1.5,0,1,.2188,.0625,1.5,0,-1,.1563,.0625,1.5,5,-1,.1563,.2188,1.5,5,1,.2188,.2188],[-1.5,0,1,.3125,.0625,1.5,0,1,.2188,.0625,1.5,5,1,.2188,.2188,-1.5,5,1,.3125,.2188]],children:[{name:"feet",pose:[0,5,0,0,0,0],quads:[[1.5,0,0,.5938,.5,-1.5,0,0,.5,.5,-1.5,0,0,.5,.5,1.5,0,0,.5938,.5],[1.5,2,0,.6875,.5,-1.5,2,0,.5938,.5,-1.5,2,0,.5938,.5,1.5,2,0,.6875,.5],[-1.5,0,0,.5,.5,-1.5,0,0,.5,.5,-1.5,2,0,.5,.5625,-1.5,2,0,.5,.5625],[1.5,0,0,.5938,.5,-1.5,0,0,.5,.5,-1.5,2,0,.5,.5625,1.5,2,0,.5938,.5625],[1.5,0,0,.5938,.5,1.5,0,0,.5938,.5,1.5,2,0,.5938,.5625,1.5,2,0,.5938,.5625],[-1.5,0,0,.6875,.5,1.5,0,0,.5938,.5,1.5,2,0,.5938,.5625,-1.5,2,0,.6875,.5625]],children:[]},{name:"right_wing",pose:[-1.5,0,0,0,0,0],quads:[[0,-2,0,.4375,0,-2,-2,0,.375,0,-2,-2,0,.375,0,0,-2,0,.4375,0],[0,5,0,.5,0,-2,5,0,.4375,0,-2,5,0,.4375,0,0,5,0,.5,0],[-2,-2,0,.375,0,-2,-2,0,.375,0,-2,5,0,.375,.2188,-2,5,0,.375,.2188],[0,-2,0,.4375,0,-2,-2,0,.375,0,-2,5,0,.375,.2188,0,5,0,.4375,.2188],[0,-2,0,.4375,0,0,-2,0,.4375,0,0,5,0,.4375,.2188,0,5,0,.4375,.2188],[-2,-2,0,.5,0,0,-2,0,.4375,0,0,5,0,.4375,.2188,-2,5,0,.5,.2188]],children:[{name:"right_wing_tip",pose:[-2,0,0,0,0,0],quads:[[0,-2,0,.6875,0,-6,-2,0,.5,0,-6,-2,0,.5,0,0,-2,0,.6875,0],[0,6,0,.875,0,-6,6,0,.6875,0,-6,6,0,.6875,0,0,6,0,.875,0],[-6,-2,0,.5,0,-6,-2,0,.5,0,-6,6,0,.5,.25,-6,6,0,.5,.25],[0,-2,0,.6875,0,-6,-2,0,.5,0,-6,6,0,.5,.25,0,6,0,.6875,.25],[0,-2,0,.6875,0,0,-2,0,.6875,0,0,6,0,.6875,.25,0,6,0,.6875,.25],[-6,-2,0,.875,0,0,-2,0,.6875,0,0,6,0,.6875,.25,-6,6,0,.875,.25]],children:[]}]},{name:"left_wing",pose:[1.5,0,0,0,0,0],quads:[[2,-2,0,.4375,.2188,0,-2,0,.375,.2188,0,-2,0,.375,.2188,2,-2,0,.4375,.2188],[2,5,0,.5,.2188,0,5,0,.4375,.2188,0,5,0,.4375,.2188,2,5,0,.5,.2188],[0,-2,0,.375,.2188,0,-2,0,.375,.2188,0,5,0,.375,.4375,0,5,0,.375,.4375],[2,-2,0,.4375,.2188,0,-2,0,.375,.2188,0,5,0,.375,.4375,2,5,0,.4375,.4375],[2,-2,0,.4375,.2188,2,-2,0,.4375,.2188,2,5,0,.4375,.4375,2,5,0,.4375,.4375],[0,-2,0,.5,.2188,2,-2,0,.4375,.2188,2,5,0,.4375,.4375,0,5,0,.5,.4375]],children:[{name:"left_wing_tip",pose:[2,0,0,0,0,0],quads:[[6,-2,0,.6875,.25,0,-2,0,.5,.25,0,-2,0,.5,.25,6,-2,0,.6875,.25],[6,6,0,.875,.25,0,6,0,.6875,.25,0,6,0,.6875,.25,6,6,0,.875,.25],[0,-2,0,.5,.25,0,-2,0,.5,.25,0,6,0,.5,.5,0,6,0,.5,.5],[6,-2,0,.6875,.25,0,-2,0,.5,.25,0,6,0,.5,.5,6,6,0,.6875,.5],[6,-2,0,.6875,.25,6,-2,0,.6875,.25,6,6,0,.6875,.5,6,6,0,.6875,.5],[0,-2,0,.875,.25,6,-2,0,.6875,.25,6,6,0,.6875,.5,0,6,0,.875,.5]],children:[]}]}]}]},parrot:{name:"root",pose:[0,0,0,0,0,0],quads:[],children:[{name:"head",pose:[0,15.69,-2.76,0,0,0],quads:[[1,-1.5,1,.1875,.0625,-1,-1.5,1,.125,.0625,-1,-1.5,-1,.125,.125,1,-1.5,-1,.1875,.125],[1,1.5,-1,.25,.125,-1,1.5,-1,.1875,.125,-1,1.5,1,.1875,.0625,1,1.5,1,.25,.0625],[-1,-1.5,-1,.125,.125,-1,-1.5,1,.0625,.125,-1,1.5,1,.0625,.2188,-1,1.5,-1,.125,.2188],[1,-1.5,-1,.1875,.125,-1,-1.5,-1,.125,.125,-1,1.5,-1,.125,.2188,1,1.5,-1,.1875,.2188],[1,-1.5,1,.25,.125,1,-1.5,-1,.1875,.125,1,1.5,-1,.1875,.2188,1,1.5,1,.25,.2188],[-1,-1.5,1,.3125,.125,1,-1.5,1,.25,.125,1,1.5,1,.25,.2188,-1,1.5,1,.3125,.2188]],children:[{name:"beak1",pose:[0,-.5,-1.5,0,0,0],quads:[[.5,-1,.5,.4063,.2188,-.5,-1,.5,.375,.2188,-.5,-1,-.5,.375,.25,.5,-1,-.5,.4063,.25],[.5,1,-.5,.4375,.25,-.5,1,-.5,.4063,.25,-.5,1,.5,.4063,.2188,.5,1,.5,.4375,.2188],[-.5,-1,-.5,.375,.25,-.5,-1,.5,.3438,.25,-.5,1,.5,.3438,.3125,-.5,1,-.5,.375,.3125],[.5,-1,-.5,.4063,.25,-.5,-1,-.5,.375,.25,-.5,1,-.5,.375,.3125,.5,1,-.5,.4063,.3125],[.5,-1,.5,.4375,.25,.5,-1,-.5,.4063,.25,.5,1,-.5,.4063,.3125,.5,1,.5,.4375,.3125],[-.5,-1,.5,.4688,.25,.5,-1,.5,.4375,.25,.5,1,.5,.4375,.3125,-.5,1,.5,.4688,.3125]],children:[]},{name:"beak2",pose:[0,-1.75,-2.45,0,0,0],quads:[[.5,0,.5,.5625,.2188,-.5,0,.5,.5313,.2188,-.5,0,-.5,.5313,.25,.5,0,-.5,.5625,.25],[.5,2,-.5,.5938,.25,-.5,2,-.5,.5625,.25,-.5,2,.5,.5625,.2188,.5,2,.5,.5938,.2188],[-.5,0,-.5,.5313,.25,-.5,0,.5,.5,.25,-.5,2,.5,.5,.3125,-.5,2,-.5,.5313,.3125],[.5,0,-.5,.5625,.25,-.5,0,-.5,.5313,.25,-.5,2,-.5,.5313,.3125,.5,2,-.5,.5625,.3125],[.5,0,.5,.5938,.25,.5,0,-.5,.5625,.25,.5,2,-.5,.5625,.3125,.5,2,.5,.5938,.3125],[-.5,0,.5,.625,.25,.5,0,.5,.5938,.25,.5,2,.5,.5938,.3125,-.5,2,.5,.625,.3125]],children:[]},{name:"feather",pose:[0,-2.15,.15,-.2214,0,0],quads:[[0,-4,2,.1875,.5625,0,-4,2,.1875,.5625,0,-4,-2,.1875,.6875,0,-4,-2,.1875,.6875],[0,1,-2,.1875,.6875,0,1,-2,.1875,.6875,0,1,2,.1875,.5625,0,1,2,.1875,.5625],[0,-4,-2,.1875,.6875,0,-4,2,.0625,.6875,0,1,2,.0625,.8438,0,1,-2,.1875,.8438],[0,-4,-2,.1875,.6875,0,-4,-2,.1875,.6875,0,1,-2,.1875,.8438,0,1,-2,.1875,.8438],[0,-4,2,.3125,.6875,0,-4,-2,.1875,.6875,0,1,-2,.1875,.8438,0,1,2,.3125,.8438],[0,-4,2,.3125,.6875,0,-4,2,.3125,.6875,0,1,2,.3125,.8438,0,1,2,.3125,.8438]],children:[]},{name:"head2",pose:[0,-2,-1,0,0,0],quads:[[1,-.5,2,.5,0,-1,-.5,2,.4375,0,-1,-.5,-2,.4375,.125,1,-.5,-2,.5,.125],[1,.5,-2,.5625,.125,-1,.5,-2,.5,.125,-1,.5,2,.5,0,1,.5,2,.5625,0],[-1,-.5,-2,.4375,.125,-1,-.5,2,.3125,.125,-1,.5,2,.3125,.1563,-1,.5,-2,.4375,.1563],[1,-.5,-2,.5,.125,-1,-.5,-2,.4375,.125,-1,.5,-2,.4375,.1563,1,.5,-2,.5,.1563],[1,-.5,2,.625,.125,1,-.5,-2,.5,.125,1,.5,-2,.5,.1563,1,.5,2,.625,.1563],[-1,-.5,2,.6875,.125,1,-.5,2,.625,.125,1,.5,2,.625,.1563,-1,.5,2,.6875,.1563]],children:[]}]},{name:"left_leg",pose:[1,22,-1.05,-.0299,0,0],quads:[[.5,0,.5,.5,.5625,-.5,0,.5,.4688,.5625,-.5,0,-.5,.4688,.5938,.5,0,-.5,.5,.5938],[.5,2,-.5,.5313,.5938,-.5,2,-.5,.5,.5938,-.5,2,.5,.5,.5625,.5,2,.5,.5313,.5625],[-.5,0,-.5,.4688,.5938,-.5,0,.5,.4375,.5938,-.5,2,.5,.4375,.6563,-.5,2,-.5,.4688,.6563],[.5,0,-.5,.5,.5938,-.5,0,-.5,.4688,.5938,-.5,2,-.5,.4688,.6563,.5,2,-.5,.5,.6563],[.5,0,.5,.5313,.5938,.5,0,-.5,.5,.5938,.5,2,-.5,.5,.6563,.5,2,.5,.5313,.6563],[-.5,0,.5,.5625,.5938,.5,0,.5,.5313,.5938,.5,2,.5,.5313,.6563,-.5,2,.5,.5625,.6563]],children:[]},{name:"right_wing",pose:[-1.5,16.94,-2.76,-.6981,-3.1416,0],quads:[[.5,0,1.5,.7188,.25,-.5,0,1.5,.6875,.25,-.5,0,-1.5,.6875,.3438,.5,0,-1.5,.7188,.3438],[.5,5,-1.5,.75,.3438,-.5,5,-1.5,.7188,.3438,-.5,5,1.5,.7188,.25,.5,5,1.5,.75,.25],[-.5,0,-1.5,.6875,.3438,-.5,0,1.5,.5938,.3438,-.5,5,1.5,.5938,.5,-.5,5,-1.5,.6875,.5],[.5,0,-1.5,.7188,.3438,-.5,0,-1.5,.6875,.3438,-.5,5,-1.5,.6875,.5,.5,5,-1.5,.7188,.5],[.5,0,1.5,.8125,.3438,.5,0,-1.5,.7188,.3438,.5,5,-1.5,.7188,.5,.5,5,1.5,.8125,.5],[-.5,0,1.5,.8438,.3438,.5,0,1.5,.8125,.3438,.5,5,1.5,.8125,.5,-.5,5,1.5,.8438,.5]],children:[]},{name:"right_leg",pose:[-1,22,-1.05,-.0299,0,0],quads:[[.5,0,.5,.5,.5625,-.5,0,.5,.4688,.5625,-.5,0,-.5,.4688,.5938,.5,0,-.5,.5,.5938],[.5,2,-.5,.5313,.5938,-.5,2,-.5,.5,.5938,-.5,2,.5,.5,.5625,.5,2,.5,.5313,.5625],[-.5,0,-.5,.4688,.5938,-.5,0,.5,.4375,.5938,-.5,2,.5,.4375,.6563,-.5,2,-.5,.4688,.6563],[.5,0,-.5,.5,.5938,-.5,0,-.5,.4688,.5938,-.5,2,-.5,.4688,.6563,.5,2,-.5,.5,.6563],[.5,0,.5,.5313,.5938,.5,0,-.5,.5,.5938,.5,2,-.5,.5,.6563,.5,2,.5,.5313,.6563],[-.5,0,.5,.5625,.5938,.5,0,.5,.5313,.5938,.5,2,.5,.5313,.6563,-.5,2,.5,.5625,.6563]],children:[]},{name:"tail",pose:[0,21.07,1.16,1.015,0,0],quads:[[1.5,-1,0,.8125,.0313,-1.5,-1,0,.7188,.0313,-1.5,-1,-1,.7188,.0625,1.5,-1,-1,.8125,.0625],[1.5,3,-1,.9063,.0625,-1.5,3,-1,.8125,.0625,-1.5,3,0,.8125,.0313,1.5,3,0,.9063,.0313],[-1.5,-1,-1,.7188,.0625,-1.5,-1,0,.6875,.0625,-1.5,3,0,.6875,.1875,-1.5,3,-1,.7188,.1875],[1.5,-1,-1,.8125,.0625,-1.5,-1,-1,.7188,.0625,-1.5,3,-1,.7188,.1875,1.5,3,-1,.8125,.1875],[1.5,-1,0,.8438,.0625,1.5,-1,-1,.8125,.0625,1.5,3,-1,.8125,.1875,1.5,3,0,.8438,.1875],[-1.5,-1,0,.9375,.0625,1.5,-1,0,.8438,.0625,1.5,3,0,.8438,.1875,-1.5,3,0,.9375,.1875]],children:[]},{name:"left_wing",pose:[1.5,16.94,-2.76,-.6981,-3.1416,0],quads:[[.5,0,1.5,.7188,.25,-.5,0,1.5,.6875,.25,-.5,0,-1.5,.6875,.3438,.5,0,-1.5,.7188,.3438],[.5,5,-1.5,.75,.3438,-.5,5,-1.5,.7188,.3438,-.5,5,1.5,.7188,.25,.5,5,1.5,.75,.25],[-.5,0,-1.5,.6875,.3438,-.5,0,1.5,.5938,.3438,-.5,5,1.5,.5938,.5,-.5,5,-1.5,.6875,.5],[.5,0,-1.5,.7188,.3438,-.5,0,-1.5,.6875,.3438,-.5,5,-1.5,.6875,.5,.5,5,-1.5,.7188,.5],[.5,0,1.5,.8125,.3438,.5,0,-1.5,.7188,.3438,.5,5,-1.5,.7188,.5,.5,5,1.5,.8125,.5],[-.5,0,1.5,.8438,.3438,.5,0,1.5,.8125,.3438,.5,5,1.5,.8125,.5,-.5,5,1.5,.8438,.5]],children:[]},{name:"body",pose:[0,16.5,-3,.4937,0,0],quads:[[1.5,0,1.5,.25,.25,-1.5,0,1.5,.1563,.25,-1.5,0,-1.5,.1563,.3438,1.5,0,-1.5,.25,.3438],[1.5,6,-1.5,.3438,.3438,-1.5,6,-1.5,.25,.3438,-1.5,6,1.5,.25,.25,1.5,6,1.5,.3438,.25],[-1.5,0,-1.5,.1563,.3438,-1.5,0,1.5,.0625,.3438,-1.5,6,1.5,.0625,.5313,-1.5,6,-1.5,.1563,.5313],[1.5,0,-1.5,.25,.3438,-1.5,0,-1.5,.1563,.3438,-1.5,6,-1.5,.1563,.5313,1.5,6,-1.5,.25,.5313],[1.5,0,1.5,.3438,.3438,1.5,0,-1.5,.25,.3438,1.5,6,-1.5,.25,.5313,1.5,6,1.5,.3438,.5313],[-1.5,0,1.5,.4375,.3438,1.5,0,1.5,.3438,.3438,1.5,6,1.5,.3438,.5313,-1.5,6,1.5,.4375,.5313]],children:[]}]},bee:{name:"root",pose:[0,0,0,0,0,0],quads:[],children:[{name:"bone",pose:[0,19,0,0,0,0],quads:[],children:[{name:"front_legs",pose:[1.5,3,-2,0,0,0],quads:[[2,0,0,.5156,.0156,-5,0,0,.4063,.0156,-5,0,0,.4063,.0156,2,0,0,.5156,.0156],[2,2,0,.625,.0156,-5,2,0,.5156,.0156,-5,2,0,.5156,.0156,2,2,0,.625,.0156],[-5,0,0,.4063,.0156,-5,0,0,.4063,.0156,-5,2,0,.4063,.0469,-5,2,0,.4063,.0469],[2,0,0,.5156,.0156,-5,0,0,.4063,.0156,-5,2,0,.4063,.0469,2,2,0,.5156,.0469],[2,0,0,.5156,.0156,2,0,0,.5156,.0156,2,2,0,.5156,.0469,2,2,0,.5156,.0469],[-5,0,0,.625,.0156,2,0,0,.5156,.0156,2,2,0,.5156,.0469,-5,2,0,.625,.0469]],children:[]},{name:"right_wing",pose:[-1.5,-4,-3,0,-.2618,0],quads:[[.001,-.001,6.001,.2344,.2813,-9.001,-.001,6.001,.0938,.2813,-9.001,-.001,-.001,.0938,.375,.001,-.001,-.001,.2344,.375],[.001,.001,-.001,.375,.375,-9.001,.001,-.001,.2344,.375,-9.001,.001,6.001,.2344,.2813,.001,.001,6.001,.375,.2813],[-9.001,-.001,-.001,.0938,.375,-9.001,-.001,6.001,0,.375,-9.001,.001,6.001,0,.375,-9.001,.001,-.001,.0938,.375],[.001,-.001,-.001,.2344,.375,-9.001,-.001,-.001,.0938,.375,-9.001,.001,-.001,.0938,.375,.001,.001,-.001,.2344,.375],[.001,-.001,6.001,.3281,.375,.001,-.001,-.001,.2344,.375,.001,.001,-.001,.2344,.375,.001,.001,6.001,.3281,.375],[-9.001,-.001,6.001,.4688,.375,.001,-.001,6.001,.3281,.375,.001,.001,6.001,.3281,.375,-9.001,.001,6.001,.4688,.375]],children:[]},{name:"left_wing",pose:[1.5,-4,-3,0,.2618,0],quads:[[-.001,-.001,-.001,.2344,.375,9.001,-.001,-.001,.0938,.375,9.001,-.001,6.001,.0938,.2813,-.001,-.001,6.001,.2344,.2813],[-.001,.001,6.001,.375,.2813,9.001,.001,6.001,.2344,.2813,9.001,.001,-.001,.2344,.375,-.001,.001,-.001,.375,.375],[9.001,.001,-.001,.0938,.375,9.001,.001,6.001,0,.375,9.001,-.001,6.001,0,.375,9.001,-.001,-.001,.0938,.375],[-.001,.001,-.001,.2344,.375,9.001,.001,-.001,.0938,.375,9.001,-.001,-.001,.0938,.375,-.001,-.001,-.001,.2344,.375],[-.001,.001,6.001,.3281,.375,-.001,.001,-.001,.2344,.375,-.001,-.001,-.001,.2344,.375,-.001,-.001,6.001,.3281,.375],[9.001,.001,6.001,.4688,.375,-.001,.001,6.001,.3281,.375,-.001,-.001,6.001,.3281,.375,9.001,-.001,6.001,.4688,.375]],children:[]},{name:"middle_legs",pose:[1.5,3,0,0,0,0],quads:[[2,0,0,.5156,.0469,-5,0,0,.4063,.0469,-5,0,0,.4063,.0469,2,0,0,.5156,.0469],[2,2,0,.625,.0469,-5,2,0,.5156,.0469,-5,2,0,.5156,.0469,2,2,0,.625,.0469],[-5,0,0,.4063,.0469,-5,0,0,.4063,.0469,-5,2,0,.4063,.0781,-5,2,0,.4063,.0781],[2,0,0,.5156,.0469,-5,0,0,.4063,.0469,-5,2,0,.4063,.0781,2,2,0,.5156,.0781],[2,0,0,.5156,.0469,2,0,0,.5156,.0469,2,2,0,.5156,.0781,2,2,0,.5156,.0781],[-5,0,0,.625,.0469,2,0,0,.5156,.0469,2,2,0,.5156,.0781,-5,2,0,.625,.0781]],children:[]},{name:"body",pose:[0,0,0,0,0,0],quads:[[3.5,-4,5,.2656,0,-3.5,-4,5,.1563,0,-3.5,-4,-5,.1563,.1563,3.5,-4,-5,.2656,.1563],[3.5,3,-5,.375,.1563,-3.5,3,-5,.2656,.1563,-3.5,3,5,.2656,0,3.5,3,5,.375,0],[-3.5,-4,-5,.1563,.1563,-3.5,-4,5,0,.1563,-3.5,3,5,0,.2656,-3.5,3,-5,.1563,.2656],[3.5,-4,-5,.2656,.1563,-3.5,-4,-5,.1563,.1563,-3.5,3,-5,.1563,.2656,3.5,3,-5,.2656,.2656],[3.5,-4,5,.4219,.1563,3.5,-4,-5,.2656,.1563,3.5,3,-5,.2656,.2656,3.5,3,5,.4219,.2656],[-3.5,-4,5,.5313,.1563,3.5,-4,5,.4219,.1563,3.5,3,5,.4219,.2656,-3.5,3,5,.5313,.2656]],children:[{name:"right_antenna",pose:[0,-2,-5,0,0,0],quads:[[-1.5,-2,0,.0938,.0469,-2.5,-2,0,.0781,.0469,-2.5,-2,-3,.0781,.0938,-1.5,-2,-3,.0938,.0938],[-1.5,0,-3,.1094,.0938,-2.5,0,-3,.0938,.0938,-2.5,0,0,.0938,.0469,-1.5,0,0,.1094,.0469],[-2.5,-2,-3,.0781,.0938,-2.5,-2,0,.0313,.0938,-2.5,0,0,.0313,.125,-2.5,0,-3,.0781,.125],[-1.5,-2,-3,.0938,.0938,-2.5,-2,-3,.0781,.0938,-2.5,0,-3,.0781,.125,-1.5,0,-3,.0938,.125],[-1.5,-2,0,.1406,.0938,-1.5,-2,-3,.0938,.0938,-1.5,0,-3,.0938,.125,-1.5,0,0,.1406,.125],[-2.5,-2,0,.1563,.0938,-1.5,-2,0,.1406,.0938,-1.5,0,0,.1406,.125,-2.5,0,0,.1563,.125]],children:[]},{name:"stinger",pose:[0,0,0,0,0,0],quads:[[0,-1,7,.4375,.1094,0,-1,7,.4375,.1094,0,-1,5,.4375,.1406,0,-1,5,.4375,.1406],[0,0,5,.4375,.1406,0,0,5,.4375,.1406,0,0,7,.4375,.1094,0,0,7,.4375,.1094],[0,-1,5,.4375,.1406,0,-1,7,.4063,.1406,0,0,7,.4063,.1563,0,0,5,.4375,.1563],[0,-1,5,.4375,.1406,0,-1,5,.4375,.1406,0,0,5,.4375,.1563,0,0,5,.4375,.1563],[0,-1,7,.4688,.1406,0,-1,5,.4375,.1406,0,0,5,.4375,.1563,0,0,7,.4688,.1563],[0,-1,7,.4688,.1406,0,-1,7,.4688,.1406,0,0,7,.4688,.1563,0,0,7,.4688,.1563]],children:[]},{name:"left_antenna",pose:[0,-2,-5,0,0,0],quads:[[2.5,-2,0,.0938,0,1.5,-2,0,.0781,0,1.5,-2,-3,.0781,.0469,2.5,-2,-3,.0938,.0469],[2.5,0,-3,.1094,.0469,1.5,0,-3,.0938,.0469,1.5,0,0,.0938,0,2.5,0,0,.1094,0],[1.5,-2,-3,.0781,.0469,1.5,-2,0,.0313,.0469,1.5,0,0,.0313,.0781,1.5,0,-3,.0781,.0781],[2.5,-2,-3,.0938,.0469,1.5,-2,-3,.0781,.0469,1.5,0,-3,.0781,.0781,2.5,0,-3,.0938,.0781],[2.5,-2,0,.1406,.0469,2.5,-2,-3,.0938,.0469,2.5,0,-3,.0938,.0781,2.5,0,0,.1406,.0781],[1.5,-2,0,.1563,.0469,2.5,-2,0,.1406,.0469,2.5,0,0,.1406,.0781,1.5,0,0,.1563,.0781]],children:[]}]},{name:"back_legs",pose:[1.5,3,2,0,0,0],quads:[[2,0,0,.5156,.0781,-5,0,0,.4063,.0781,-5,0,0,.4063,.0781,2,0,0,.5156,.0781],[2,2,0,.625,.0781,-5,2,0,.5156,.0781,-5,2,0,.5156,.0781,2,2,0,.625,.0781],[-5,0,0,.4063,.0781,-5,0,0,.4063,.0781,-5,2,0,.4063,.1094,-5,2,0,.4063,.1094],[2,0,0,.5156,.0781,-5,0,0,.4063,.0781,-5,2,0,.4063,.1094,2,2,0,.5156,.1094],[2,0,0,.5156,.0781,2,0,0,.5156,.0781,2,2,0,.5156,.1094,2,2,0,.5156,.1094],[-5,0,0,.625,.0781,2,0,0,.5156,.0781,2,2,0,.5156,.1094,-5,2,0,.625,.1094]],children:[]}]}]},blaze:{name:"root",pose:[0,0,0,0,0,0],quads:[],children:[{name:"part0",pose:[9,-1,0,0,0,0],quads:[[2,0,2,.0625,.5,0,0,2,.0313,.5,0,0,0,.0313,.5625,2,0,0,.0625,.5625],[2,8,0,.0938,.5625,0,8,0,.0625,.5625,0,8,2,.0625,.5,2,8,2,.0938,.5],[0,0,0,.0313,.5625,0,0,2,0,.5625,0,8,2,0,.8125,0,8,0,.0313,.8125],[2,0,0,.0625,.5625,0,0,0,.0313,.5625,0,8,0,.0313,.8125,2,8,0,.0625,.8125],[2,0,2,.0938,.5625,2,0,0,.0625,.5625,2,8,0,.0625,.8125,2,8,2,.0938,.8125],[0,0,2,.125,.5625,2,0,2,.0938,.5625,2,8,2,.0938,.8125,0,8,2,.125,.8125]],children:[]},{name:"part1",pose:[0,-1.12,9,0,0,0],quads:[[2,0,2,.0625,.5,0,0,2,.0313,.5,0,0,0,.0313,.5625,2,0,0,.0625,.5625],[2,8,0,.0938,.5625,0,8,0,.0625,.5625,0,8,2,.0625,.5,2,8,2,.0938,.5],[0,0,0,.0313,.5625,0,0,2,0,.5625,0,8,2,0,.8125,0,8,0,.0313,.8125],[2,0,0,.0625,.5625,0,0,0,.0313,.5625,0,8,0,.0313,.8125,2,8,0,.0625,.8125],[2,0,2,.0938,.5625,2,0,0,.0625,.5625,2,8,0,.0625,.8125,2,8,2,.0938,.8125],[0,0,2,.125,.5625,2,0,2,.0938,.5625,2,8,2,.0938,.8125,0,8,2,.125,.8125]],children:[]},{name:"part2",pose:[-9,-1.46,0,0,0,0],quads:[[2,0,2,.0625,.5,0,0,2,.0313,.5,0,0,0,.0313,.5625,2,0,0,.0625,.5625],[2,8,0,.0938,.5625,0,8,0,.0625,.5625,0,8,2,.0625,.5,2,8,2,.0938,.5],[0,0,0,.0313,.5625,0,0,2,0,.5625,0,8,2,0,.8125,0,8,0,.0313,.8125],[2,0,0,.0625,.5625,0,0,0,.0313,.5625,0,8,0,.0313,.8125,2,8,0,.0625,.8125],[2,0,2,.0938,.5625,2,0,0,.0625,.5625,2,8,0,.0625,.8125,2,8,2,.0938,.8125],[0,0,2,.125,.5625,2,0,2,.0938,.5625,2,8,2,.0938,.8125,0,8,2,.125,.8125]],children:[]},{name:"head",pose:[0,0,0,0,0,0],quads:[[4,-4,4,.25,0,-4,-4,4,.125,0,-4,-4,-4,.125,.25,4,-4,-4,.25,.25],[4,4,-4,.375,.25,-4,4,-4,.25,.25,-4,4,4,.25,0,4,4,4,.375,0],[-4,-4,-4,.125,.25,-4,-4,4,0,.25,-4,4,4,0,.5,-4,4,-4,.125,.5],[4,-4,-4,.25,.25,-4,-4,-4,.125,.25,-4,4,-4,.125,.5,4,4,-4,.25,.5],[4,-4,4,.375,.25,4,-4,-4,.25,.25,4,4,-4,.25,.5,4,4,4,.375,.5],[-4,-4,4,.5,.25,4,-4,4,.375,.25,4,4,4,.375,.5,-4,4,4,.5,.5]],children:[]},{name:"part3",pose:[0,-1.93,-9,0,0,0],quads:[[2,0,2,.0625,.5,0,0,2,.0313,.5,0,0,0,.0313,.5625,2,0,0,.0625,.5625],[2,8,0,.0938,.5625,0,8,0,.0625,.5625,0,8,2,.0625,.5,2,8,2,.0938,.5],[0,0,0,.0313,.5625,0,0,2,0,.5625,0,8,2,0,.8125,0,8,0,.0313,.8125],[2,0,0,.0625,.5625,0,0,0,.0313,.5625,0,8,0,.0313,.8125,2,8,0,.0625,.8125],[2,0,2,.0938,.5625,2,0,0,.0625,.5625,2,8,0,.0625,.8125,2,8,2,.0938,.8125],[0,0,2,.125,.5625,2,0,2,.0938,.5625,2,8,2,.0938,.8125,0,8,2,.125,.8125]],children:[]},{name:"part11",pose:[2.27,10.61,-4.46,0,0,0],quads:[[2,0,2,.0625,.5,0,0,2,.0313,.5,0,0,0,.0313,.5625,2,0,0,.0625,.5625],[2,8,0,.0938,.5625,0,8,0,.0625,.5625,0,8,2,.0625,.5,2,8,2,.0938,.5],[0,0,0,.0313,.5625,0,0,2,0,.5625,0,8,2,0,.8125,0,8,0,.0313,.8125],[2,0,0,.0625,.5625,0,0,0,.0313,.5625,0,8,0,.0313,.8125,2,8,0,.0625,.8125],[2,0,2,.0938,.5625,2,0,0,.0625,.5625,2,8,0,.0625,.8125,2,8,2,.0938,.8125],[0,0,2,.125,.5625,2,0,2,.0938,.5625,2,8,2,.0938,.8125,0,8,2,.125,.8125]],children:[]},{name:"part4",pose:[4.95,1.58,4.95,0,0,0],quads:[[2,0,2,.0625,.5,0,0,2,.0313,.5,0,0,0,.0313,.5625,2,0,0,.0625,.5625],[2,8,0,.0938,.5625,0,8,0,.0625,.5625,0,8,2,.0625,.5,2,8,2,.0938,.5],[0,0,0,.0313,.5625,0,0,2,0,.5625,0,8,2,0,.8125,0,8,0,.0313,.8125],[2,0,0,.0625,.5625,0,0,0,.0313,.5625,0,8,0,.0313,.8125,2,8,0,.0625,.8125],[2,0,2,.0938,.5625,2,0,0,.0625,.5625,2,8,0,.0625,.8125,2,8,2,.0938,.8125],[0,0,2,.125,.5625,2,0,2,.0938,.5625,2,8,2,.0938,.8125,0,8,2,.125,.8125]],children:[]},{name:"part10",pose:[-4.46,11.35,-2.27,0,0,0],quads:[[2,0,2,.0625,.5,0,0,2,.0313,.5,0,0,0,.0313,.5625,2,0,0,.0625,.5625],[2,8,0,.0938,.5625,0,8,0,.0625,.5625,0,8,2,.0625,.5,2,8,2,.0938,.5],[0,0,0,.0313,.5625,0,0,2,0,.5625,0,8,2,0,.8125,0,8,0,.0313,.8125],[2,0,0,.0625,.5625,0,0,0,.0313,.5625,0,8,0,.0313,.8125,2,8,0,.0625,.8125],[2,0,2,.0938,.5625,2,0,0,.0625,.5625,2,8,0,.0625,.8125,2,8,2,.0938,.8125],[0,0,2,.125,.5625,2,0,2,.0938,.5625,2,8,2,.0938,.8125,0,8,2,.125,.8125]],children:[]},{name:"part5",pose:[-4.95,1.2,4.95,0,0,0],quads:[[2,0,2,.0625,.5,0,0,2,.0313,.5,0,0,0,.0313,.5625,2,0,0,.0625,.5625],[2,8,0,.0938,.5625,0,8,0,.0625,.5625,0,8,2,.0625,.5,2,8,2,.0938,.5],[0,0,0,.0313,.5625,0,0,2,0,.5625,0,8,2,0,.8125,0,8,0,.0313,.8125],[2,0,0,.0625,.5625,0,0,0,.0313,.5625,0,8,0,.0313,.8125,2,8,0,.0625,.8125],[2,0,2,.0938,.5625,2,0,0,.0625,.5625,2,8,0,.0625,.8125,2,8,2,.0938,.8125],[0,0,2,.125,.5625,2,0,2,.0938,.5625,2,8,2,.0938,.8125,0,8,2,.125,.8125]],children:[]},{name:"part6",pose:[-4.95,1.01,-4.95,0,0,0],quads:[[2,0,2,.0625,.5,0,0,2,.0313,.5,0,0,0,.0313,.5625,2,0,0,.0625,.5625],[2,8,0,.0938,.5625,0,8,0,.0625,.5625,0,8,2,.0625,.5,2,8,2,.0938,.5],[0,0,0,.0313,.5625,0,0,2,0,.5625,0,8,2,0,.8125,0,8,0,.0313,.8125],[2,0,0,.0625,.5625,0,0,0,.0313,.5625,0,8,0,.0313,.8125,2,8,0,.0625,.8125],[2,0,2,.0938,.5625,2,0,0,.0625,.5625,2,8,0,.0625,.8125,2,8,2,.0938,.8125],[0,0,2,.125,.5625,2,0,2,.0938,.5625,2,8,2,.0938,.8125,0,8,2,.125,.8125]],children:[]},{name:"part7",pose:[4.95,1.06,-4.95,0,0,0],quads:[[2,0,2,.0625,.5,0,0,2,.0313,.5,0,0,0,.0313,.5625,2,0,0,.0625,.5625],[2,8,0,.0938,.5625,0,8,0,.0625,.5625,0,8,2,.0625,.5,2,8,2,.0938,.5],[0,0,0,.0313,.5625,0,0,2,0,.5625,0,8,2,0,.8125,0,8,0,.0313,.8125],[2,0,0,.0625,.5625,0,0,0,.0313,.5625,0,8,0,.0313,.8125,2,8,0,.0625,.8125],[2,0,2,.0938,.5625,2,0,0,.0625,.5625,2,8,0,.0625,.8125,2,8,2,.0938,.8125],[0,0,2,.125,.5625,2,0,2,.0938,.5625,2,8,2,.0938,.8125,0,8,2,.125,.8125]],children:[]},{name:"part8",pose:[4.46,11.96,2.27,0,0,0],quads:[[2,0,2,.0625,.5,0,0,2,.0313,.5,0,0,0,.0313,.5625,2,0,0,.0625,.5625],[2,8,0,.0938,.5625,0,8,0,.0625,.5625,0,8,2,.0625,.5,2,8,2,.0938,.5],[0,0,0,.0313,.5625,0,0,2,0,.5625,0,8,2,0,.8125,0,8,0,.0313,.8125],[2,0,0,.0625,.5625,0,0,0,.0313,.5625,0,8,0,.0313,.8125,2,8,0,.0625,.8125],[2,0,2,.0938,.5625,2,0,0,.0625,.5625,2,8,0,.0625,.8125,2,8,2,.0938,.8125],[0,0,2,.125,.5625,2,0,2,.0938,.5625,2,8,2,.0938,.8125,0,8,2,.125,.8125]],children:[]},{name:"part9",pose:[-2.27,11.89,4.46,0,0,0],quads:[[2,0,2,.0625,.5,0,0,2,.0313,.5,0,0,0,.0313,.5625,2,0,0,.0625,.5625],[2,8,0,.0938,.5625,0,8,0,.0625,.5625,0,8,2,.0625,.5,2,8,2,.0938,.5],[0,0,0,.0313,.5625,0,0,2,0,.5625,0,8,2,0,.8125,0,8,0,.0313,.8125],[2,0,0,.0625,.5625,0,0,0,.0313,.5625,0,8,0,.0313,.8125,2,8,0,.0625,.8125],[2,0,2,.0938,.5625,2,0,0,.0625,.5625,2,8,0,.0625,.8125,2,8,2,.0938,.8125],[0,0,2,.125,.5625,2,0,2,.0938,.5625,2,8,2,.0938,.8125,0,8,2,.125,.8125]],children:[]}]},phantom:{name:"root",pose:[0,-8,0,-.6,0,0],quads:[],children:[{name:"body",pose:[0,0,0,-.1,0,0],quads:[[2,-2,1,.2188,.125,-3,-2,1,.1406,.125,-3,-2,-8,.1406,.2656,2,-2,-8,.2188,.2656],[2,1,-8,.2969,.2656,-3,1,-8,.2188,.2656,-3,1,1,.2188,.125,2,1,1,.2969,.125],[-3,-2,-8,.1406,.2656,-3,-2,1,0,.2656,-3,1,1,0,.3125,-3,1,-8,.1406,.3125],[2,-2,-8,.2188,.2656,-3,-2,-8,.1406,.2656,-3,1,-8,.1406,.3125,2,1,-8,.2188,.3125],[2,-2,1,.3594,.2656,2,-2,-8,.2188,.2656,2,1,-8,.2188,.3125,2,1,1,.3594,.3125],[-3,-2,1,.4375,.2656,2,-2,1,.3594,.2656,2,1,1,.3594,.3125,-3,1,1,.4375,.3125]],children:[{name:"head",pose:[0,1,-7,.2,0,0],quads:[[3,-2,0,.1875,0,-4,-2,0,.0781,0,-4,-2,-5,.0781,.0781,3,-2,-5,.1875,.0781],[3,1,-5,.2969,.0781,-4,1,-5,.1875,.0781,-4,1,0,.1875,0,3,1,0,.2969,0],[-4,-2,-5,.0781,.0781,-4,-2,0,0,.0781,-4,1,0,0,.125,-4,1,-5,.0781,.125],[3,-2,-5,.1875,.0781,-4,-2,-5,.0781,.0781,-4,1,-5,.0781,.125,3,1,-5,.1875,.125],[3,-2,0,.2656,.0781,3,-2,-5,.1875,.0781,3,1,-5,.1875,.125,3,1,0,.2656,.125],[-4,-2,0,.375,.0781,3,-2,0,.2656,.0781,3,1,0,.2656,.125,-4,1,0,.375,.125]],children:[]},{name:"right_wing_base",pose:[-3,-2,-8,0,0,-.1],quads:[[-6,0,0,.5938,.3281,0,0,0,.5,.3281,0,0,9,.5,.1875,-6,0,9,.5938,.1875],[-6,2,9,.6875,.1875,0,2,9,.5938,.1875,0,2,0,.5938,.3281,-6,2,0,.6875,.3281],[0,2,0,.5,.3594,0,2,9,.3594,.3594,0,0,9,.3594,.3281,0,0,0,.5,.3281],[-6,2,0,.5938,.3594,0,2,0,.5,.3594,0,0,0,.5,.3281,-6,0,0,.5938,.3281],[-6,2,9,.7344,.3594,-6,2,0,.5938,.3594,-6,0,0,.5938,.3281,-6,0,9,.7344,.3281],[0,2,9,.8281,.3594,-6,2,9,.7344,.3594,-6,0,9,.7344,.3281,0,0,9,.8281,.3281]],children:[{name:"right_wing_tip",pose:[-6,0,0,0,0,-.1],quads:[[-13,0,0,.5938,.5156,0,0,0,.3906,.5156,0,0,9,.3906,.375,-13,0,9,.5938,.375],[-13,1,9,.7969,.375,0,1,9,.5938,.375,0,1,0,.5938,.5156,-13,1,0,.7969,.5156],[0,1,0,.3906,.5313,0,1,9,.25,.5313,0,0,9,.25,.5156,0,0,0,.3906,.5156],[-13,1,0,.5938,.5313,0,1,0,.3906,.5313,0,0,0,.3906,.5156,-13,0,0,.5938,.5156],[-13,1,9,.7344,.5313,-13,1,0,.5938,.5313,-13,0,0,.5938,.5156,-13,0,9,.7344,.5156],[0,1,9,.9375,.5313,-13,1,9,.7344,.5313,-13,0,9,.7344,.5156,0,0,9,.9375,.5156]],children:[]}]},{name:"tail_base",pose:[0,-2,1,0,0,0],quads:[[1,0,6,.1875,.3125,-2,0,6,.1406,.3125,-2,0,0,.1406,.4063,1,0,0,.1875,.4063],[1,2,0,.2344,.4063,-2,2,0,.1875,.4063,-2,2,6,.1875,.3125,1,2,6,.2344,.3125],[-2,0,0,.1406,.4063,-2,0,6,.0469,.4063,-2,2,6,.0469,.4375,-2,2,0,.1406,.4375],[1,0,0,.1875,.4063,-2,0,0,.1406,.4063,-2,2,0,.1406,.4375,1,2,0,.1875,.4375],[1,0,6,.2813,.4063,1,0,0,.1875,.4063,1,2,0,.1875,.4375,1,2,6,.2813,.4375],[-2,0,6,.3281,.4063,1,0,6,.2813,.4063,1,2,6,.2813,.4375,-2,2,6,.3281,.4375]],children:[{name:"tail_tip",pose:[0,.5,6,0,0,0],quads:[[0,0,6,.1719,.4531,-1,0,6,.1563,.4531,-1,0,0,.1563,.5469,0,0,0,.1719,.5469],[0,1,0,.1875,.5469,-1,1,0,.1719,.5469,-1,1,6,.1719,.4531,0,1,6,.1875,.4531],[-1,0,0,.1563,.5469,-1,0,6,.0625,.5469,-1,1,6,.0625,.5625,-1,1,0,.1563,.5625],[0,0,0,.1719,.5469,-1,0,0,.1563,.5469,-1,1,0,.1563,.5625,0,1,0,.1719,.5625],[0,0,6,.2656,.5469,0,0,0,.1719,.5469,0,1,0,.1719,.5625,0,1,6,.2656,.5625],[-1,0,6,.2813,.5469,0,0,6,.2656,.5469,0,1,6,.2656,.5625,-1,1,6,.2813,.5625]],children:[]}]},{name:"left_wing_base",pose:[2,-2,-8,0,0,.1],quads:[[6,0,9,.5938,.1875,0,0,9,.5,.1875,0,0,0,.5,.3281,6,0,0,.5938,.3281],[6,2,0,.6875,.3281,0,2,0,.5938,.3281,0,2,9,.5938,.1875,6,2,9,.6875,.1875],[0,0,0,.5,.3281,0,0,9,.3594,.3281,0,2,9,.3594,.3594,0,2,0,.5,.3594],[6,0,0,.5938,.3281,0,0,0,.5,.3281,0,2,0,.5,.3594,6,2,0,.5938,.3594],[6,0,9,.7344,.3281,6,0,0,.5938,.3281,6,2,0,.5938,.3594,6,2,9,.7344,.3594],[0,0,9,.8281,.3281,6,0,9,.7344,.3281,6,2,9,.7344,.3594,0,2,9,.8281,.3594]],children:[{name:"left_wing_tip",pose:[6,0,0,0,0,.1],quads:[[13,0,9,.5938,.375,0,0,9,.3906,.375,0,0,0,.3906,.5156,13,0,0,.5938,.5156],[13,1,0,.7969,.5156,0,1,0,.5938,.5156,0,1,9,.5938,.375,13,1,9,.7969,.375],[0,0,0,.3906,.5156,0,0,9,.25,.5156,0,1,9,.25,.5313,0,1,0,.3906,.5313],[13,0,0,.5938,.5156,0,0,0,.3906,.5156,0,1,0,.3906,.5313,13,1,0,.5938,.5313],[13,0,9,.7344,.5156,13,0,0,.5938,.5156,13,1,0,.5938,.5313,13,1,9,.7344,.5313],[0,0,9,.9375,.5156,13,0,9,.7344,.5156,13,1,9,.7344,.5313,0,1,9,.9375,.5313]],children:[]}]}]}]},axolotl:{name:"root",pose:[0,0,0,0,0,0],quads:[],children:[{name:"body",pose:[0,19.5,5,0,0,0],quads:[[4,-2,1,.2813,.1719,-4,-2,1,.1563,.1719,-4,-2,-9,.1563,.3281,4,-2,-9,.2813,.3281],[4,2,-9,.4063,.3281,-4,2,-9,.2813,.3281,-4,2,1,.2813,.1719,4,2,1,.4063,.1719],[-4,-2,-9,.1563,.3281,-4,-2,1,0,.3281,-4,2,1,0,.3906,-4,2,-9,.1563,.3906],[4,-2,-9,.2813,.3281,-4,-2,-9,.1563,.3281,-4,2,-9,.1563,.3906,4,2,-9,.2813,.3906],[4,-2,1,.4375,.3281,4,-2,-9,.2813,.3281,4,2,-9,.2813,.3906,4,2,1,.4375,.3906],[-4,-2,1,.5625,.3281,4,-2,1,.4375,.3281,4,2,1,.4375,.3906,-4,2,1,.5625,.3906],[0,-3,1,.1719,.2656,0,-3,1,.1719,.2656,0,-3,-8,.1719,.4063,0,-3,-8,.1719,.4063],[0,2,-8,.1719,.4063,0,2,-8,.1719,.4063,0,2,1,.1719,.2656,0,2,1,.1719,.2656],[0,-3,-8,.1719,.4063,0,-3,1,.0313,.4063,0,2,1,.0313,.4844,0,2,-8,.1719,.4844],[0,-3,-8,.1719,.4063,0,-3,-8,.1719,.4063,0,2,-8,.1719,.4844,0,2,-8,.1719,.4844],[0,-3,1,.3125,.4063,0,-3,-8,.1719,.4063,0,2,-8,.1719,.4844,0,2,1,.3125,.4844],[0,-3,1,.3125,.4063,0,-3,1,.3125,.4063,0,2,1,.3125,.4844,0,2,1,.3125,.4844]],children:[{name:"head",pose:[0,0,-9,0,0,0],quads:[[4,-3,0,.2031,.0156,-4,-3,0,.0781,.0156,-4,-3,-5,.0781,.0938,4,-3,-5,.2031,.0938],[4,2,-5,.3281,.0938,-4,2,-5,.2031,.0938,-4,2,0,.2031,.0156,4,2,0,.3281,.0156],[-4,-3,-5,.0781,.0938,-4,-3,0,0,.0938,-4,2,0,0,.1719,-4,2,-5,.0781,.1719],[4,-3,-5,.2031,.0938,-4,-3,-5,.0781,.0938,-4,2,-5,.0781,.1719,4,2,-5,.2031,.1719],[4,-3,0,.2813,.0938,4,-3,-5,.2031,.0938,4,2,-5,.2031,.1719,4,2,0,.2813,.1719],[-4,-3,0,.4063,.0938,4,-3,0,.2813,.0938,4,2,0,.2813,.1719,-4,2,0,.4063,.1719]],children:[{name:"top_gills",pose:[0,-3,-1,0,0,0],quads:[[4,-3,0,.1719,.5781,-4,-3,0,.0469,.5781,-4,-3,0,.0469,.5781,4,-3,0,.1719,.5781],[4,0,0,.2969,.5781,-4,0,0,.1719,.5781,-4,0,0,.1719,.5781,4,0,0,.2969,.5781],[-4,-3,0,.0469,.5781,-4,-3,0,.0469,.5781,-4,0,0,.0469,.625,-4,0,0,.0469,.625],[4,-3,0,.1719,.5781,-4,-3,0,.0469,.5781,-4,0,0,.0469,.625,4,0,0,.1719,.625],[4,-3,0,.1719,.5781,4,-3,0,.1719,.5781,4,0,0,.1719,.625,4,0,0,.1719,.625],[-4,-3,0,.2969,.5781,4,-3,0,.1719,.5781,4,0,0,.1719,.625,-4,0,0,.2969,.625]],children:[]},{name:"left_gills",pose:[-4,0,-1,0,0,0],quads:[[0,-5,0,.0469,.625,-3,-5,0,0,.625,-3,-5,0,0,.625,0,-5,0,.0469,.625],[0,2,0,.0938,.625,-3,2,0,.0469,.625,-3,2,0,.0469,.625,0,2,0,.0938,.625],[-3,-5,0,0,.625,-3,-5,0,0,.625,-3,2,0,0,.7344,-3,2,0,0,.7344],[0,-5,0,.0469,.625,-3,-5,0,0,.625,-3,2,0,0,.7344,0,2,0,.0469,.7344],[0,-5,0,.0469,.625,0,-5,0,.0469,.625,0,2,0,.0469,.7344,0,2,0,.0469,.7344],[-3,-5,0,.0938,.625,0,-5,0,.0469,.625,0,2,0,.0469,.7344,-3,2,0,.0938,.7344]],children:[]},{name:"right_gills",pose:[4,0,-1,0,0,0],quads:[[3,-5,0,.2188,.625,0,-5,0,.1719,.625,0,-5,0,.1719,.625,3,-5,0,.2188,.625],[3,2,0,.2656,.625,0,2,0,.2188,.625,0,2,0,.2188,.625,3,2,0,.2656,.625],[0,-5,0,.1719,.625,0,-5,0,.1719,.625,0,2,0,.1719,.7344,0,2,0,.1719,.7344],[3,-5,0,.2188,.625,0,-5,0,.1719,.625,0,2,0,.1719,.7344,3,2,0,.2188,.7344],[3,-5,0,.2188,.625,3,-5,0,.2188,.625,3,2,0,.2188,.7344,3,2,0,.2188,.7344],[0,-5,0,.2656,.625,3,-5,0,.2188,.625,3,2,0,.2188,.7344,0,2,0,.2656,.7344]],children:[]}]},{name:"right_front_leg",pose:[-3.5,1,-8,0,0,0],quads:[[1,0,0,.0781,.2031,-2,0,0,.0313,.2031,-2,0,0,.0313,.2031,1,0,0,.0781,.2031],[1,5,0,.125,.2031,-2,5,0,.0781,.2031,-2,5,0,.0781,.2031,1,5,0,.125,.2031],[-2,0,0,.0313,.2031,-2,0,0,.0313,.2031,-2,5,0,.0313,.2813,-2,5,0,.0313,.2813],[1,0,0,.0781,.2031,-2,0,0,.0313,.2031,-2,5,0,.0313,.2813,1,5,0,.0781,.2813],[1,0,0,.0781,.2031,1,0,0,.0781,.2031,1,5,0,.0781,.2813,1,5,0,.0781,.2813],[-2,0,0,.125,.2031,1,0,0,.0781,.2031,1,5,0,.0781,.2813,-2,5,0,.125,.2813]],children:[]},{name:"right_hind_leg",pose:[-3.5,1,-1,0,0,0],quads:[[1,0,0,.0781,.2031,-2,0,0,.0313,.2031,-2,0,0,.0313,.2031,1,0,0,.0781,.2031],[1,5,0,.125,.2031,-2,5,0,.0781,.2031,-2,5,0,.0781,.2031,1,5,0,.125,.2031],[-2,0,0,.0313,.2031,-2,0,0,.0313,.2031,-2,5,0,.0313,.2813,-2,5,0,.0313,.2813],[1,0,0,.0781,.2031,-2,0,0,.0313,.2031,-2,5,0,.0313,.2813,1,5,0,.0781,.2813],[1,0,0,.0781,.2031,1,0,0,.0781,.2031,1,5,0,.0781,.2813,1,5,0,.0781,.2813],[-2,0,0,.125,.2031,1,0,0,.0781,.2031,1,5,0,.0781,.2813,-2,5,0,.125,.2813]],children:[]},{name:"tail",pose:[0,0,1,0,0,0],quads:[[0,-3,12,.2188,.2969,0,-3,12,.2188,.2969,0,-3,0,.2188,.4844,0,-3,0,.2188,.4844],[0,2,0,.2188,.4844,0,2,0,.2188,.4844,0,2,12,.2188,.2969,0,2,12,.2188,.2969],[0,-3,0,.2188,.4844,0,-3,12,.0313,.4844,0,2,12,.0313,.5625,0,2,0,.2188,.5625],[0,-3,0,.2188,.4844,0,-3,0,.2188,.4844,0,2,0,.2188,.5625,0,2,0,.2188,.5625],[0,-3,12,.4063,.4844,0,-3,0,.2188,.4844,0,2,0,.2188,.5625,0,2,12,.4063,.5625],[0,-3,12,.4063,.4844,0,-3,12,.4063,.4844,0,2,12,.4063,.5625,0,2,12,.4063,.5625]],children:[]},{name:"left_hind_leg",pose:[3.5,1,-1,0,0,0],quads:[[2,0,0,.0781,.2031,-1,0,0,.0313,.2031,-1,0,0,.0313,.2031,2,0,0,.0781,.2031],[2,5,0,.125,.2031,-1,5,0,.0781,.2031,-1,5,0,.0781,.2031,2,5,0,.125,.2031],[-1,0,0,.0313,.2031,-1,0,0,.0313,.2031,-1,5,0,.0313,.2813,-1,5,0,.0313,.2813],[2,0,0,.0781,.2031,-1,0,0,.0313,.2031,-1,5,0,.0313,.2813,2,5,0,.0781,.2813],[2,0,0,.0781,.2031,2,0,0,.0781,.2031,2,5,0,.0781,.2813,2,5,0,.0781,.2813],[-1,0,0,.125,.2031,2,0,0,.0781,.2031,2,5,0,.0781,.2813,-1,5,0,.125,.2813]],children:[]},{name:"left_front_leg",pose:[3.5,1,-8,0,0,0],quads:[[2,0,0,.0781,.2031,-1,0,0,.0313,.2031,-1,0,0,.0313,.2031,2,0,0,.0781,.2031],[2,5,0,.125,.2031,-1,5,0,.0781,.2031,-1,5,0,.0781,.2031,2,5,0,.125,.2031],[-1,0,0,.0313,.2031,-1,0,0,.0313,.2031,-1,5,0,.0313,.2813,-1,5,0,.0313,.2813],[2,0,0,.0781,.2031,-1,0,0,.0313,.2031,-1,5,0,.0313,.2813,2,5,0,.0781,.2813],[2,0,0,.0781,.2031,2,0,0,.0781,.2031,2,5,0,.0781,.2813,2,5,0,.0781,.2813],[-1,0,0,.125,.2031,2,0,0,.0781,.2031,2,5,0,.0781,.2813,-1,5,0,.125,.2813]],children:[]}]}]},frog:{name:"root",pose:[0,0,0,0,0,0],quads:[],children:[{name:"root",pose:[0,24,0,0,0,0],quads:[],children:[{name:"left_leg",pose:[3.5,-3,4,0,0,0],quads:[[2,0,2,.4375,.5208,-1,0,2,.375,.5208,-1,0,-2,.375,.6042,2,0,-2,.4375,.6042],[2,3,-2,.5,.6042,-1,3,-2,.4375,.6042,-1,3,2,.4375,.5208,2,3,2,.5,.5208],[-1,0,-2,.375,.6042,-1,0,2,.2917,.6042,-1,3,2,.2917,.6667,-1,3,-2,.375,.6667],[2,0,-2,.4375,.6042,-1,0,-2,.375,.6042,-1,3,-2,.375,.6667,2,3,-2,.4375,.6667],[2,0,2,.5208,.6042,2,0,-2,.4375,.6042,2,3,-2,.4375,.6667,2,3,2,.5208,.6667],[-1,0,2,.5833,.6042,2,0,2,.5208,.6042,2,3,2,.5208,.6667,-1,3,2,.5833,.6667]],children:[{name:"left_foot",pose:[2,3,0,0,0,0],quads:[[4,.01,4,.375,.6667,-4,.01,4,.2083,.6667,-4,.01,-4,.2083,.8333,4,.01,-4,.375,.8333],[4,.01,-4,.5417,.8333,-4,.01,-4,.375,.8333,-4,.01,4,.375,.6667,4,.01,4,.5417,.6667],[-4,.01,-4,.2083,.8333,-4,.01,4,.0417,.8333,-4,.01,4,.0417,.8333,-4,.01,-4,.2083,.8333],[4,.01,-4,.375,.8333,-4,.01,-4,.2083,.8333,-4,.01,-4,.2083,.8333,4,.01,-4,.375,.8333],[4,.01,4,.5417,.8333,4,.01,-4,.375,.8333,4,.01,-4,.375,.8333,4,.01,4,.5417,.8333],[-4,.01,4,.7083,.8333,4,.01,4,.5417,.8333,4,.01,4,.5417,.8333,-4,.01,4,.7083,.8333]],children:[]}]},{name:"right_leg",pose:[-3.5,-3,4,0,0,0],quads:[[1,0,2,.1458,.5208,-2,0,2,.0833,.5208,-2,0,-2,.0833,.6042,1,0,-2,.1458,.6042],[1,3,-2,.2083,.6042,-2,3,-2,.1458,.6042,-2,3,2,.1458,.5208,1,3,2,.2083,.5208],[-2,0,-2,.0833,.6042,-2,0,2,0,.6042,-2,3,2,0,.6667,-2,3,-2,.0833,.6667],[1,0,-2,.1458,.6042,-2,0,-2,.0833,.6042,-2,3,-2,.0833,.6667,1,3,-2,.1458,.6667],[1,0,2,.2292,.6042,1,0,-2,.1458,.6042,1,3,-2,.1458,.6667,1,3,2,.2292,.6667],[-2,0,2,.2917,.6042,1,0,2,.2292,.6042,1,3,2,.2292,.6667,-2,3,2,.2917,.6667]],children:[{name:"right_foot",pose:[-2,3,0,0,0,0],quads:[[4,.01,4,.7083,.6667,-4,.01,4,.5417,.6667,-4,.01,-4,.5417,.8333,4,.01,-4,.7083,.8333],[4,.01,-4,.875,.8333,-4,.01,-4,.7083,.8333,-4,.01,4,.7083,.6667,4,.01,4,.875,.6667],[-4,.01,-4,.5417,.8333,-4,.01,4,.375,.8333,-4,.01,4,.375,.8333,-4,.01,-4,.5417,.8333],[4,.01,-4,.7083,.8333,-4,.01,-4,.5417,.8333,-4,.01,-4,.5417,.8333,4,.01,-4,.7083,.8333],[4,.01,4,.875,.8333,4,.01,-4,.7083,.8333,4,.01,-4,.7083,.8333,4,.01,4,.875,.8333],[-4,.01,4,1.0417,.8333,4,.01,4,.875,.8333,4,.01,4,.875,.8333,-4,.01,4,1.0417,.8333]],children:[]}]},{name:"body",pose:[0,-2,4,0,0,0],quads:[[3.5,-2,1,.3958,.0208,-3.5,-2,1,.25,.0208,-3.5,-2,-8,.25,.2083,3.5,-2,-8,.3958,.2083],[3.5,1,-8,.5417,.2083,-3.5,1,-8,.3958,.2083,-3.5,1,1,.3958,.0208,3.5,1,1,.5417,.0208],[-3.5,-2,-8,.25,.2083,-3.5,-2,1,.0625,.2083,-3.5,1,1,.0625,.2708,-3.5,1,-8,.25,.2708],[3.5,-2,-8,.3958,.2083,-3.5,-2,-8,.25,.2083,-3.5,1,-8,.25,.2708,3.5,1,-8,.3958,.2708],[3.5,-2,1,.5833,.2083,3.5,-2,-8,.3958,.2083,3.5,1,-8,.3958,.2708,3.5,1,1,.5833,.2708],[-3.5,-2,1,.7292,.2083,3.5,-2,1,.5833,.2083,3.5,1,1,.5833,.2708,-3.5,1,1,.7292,.2708],[3.5,-1,1,.8125,.4583,-3.5,-1,1,.6667,.4583,-3.5,-1,-8,.6667,.6458,3.5,-1,-8,.8125,.6458],[3.5,-1,-8,.9583,.6458,-3.5,-1,-8,.8125,.6458,-3.5,-1,1,.8125,.4583,3.5,-1,1,.9583,.4583],[-3.5,-1,-8,.6667,.6458,-3.5,-1,1,.4792,.6458,-3.5,-1,1,.4792,.6458,-3.5,-1,-8,.6667,.6458],[3.5,-1,-8,.8125,.6458,-3.5,-1,-8,.6667,.6458,-3.5,-1,-8,.6667,.6458,3.5,-1,-8,.8125,.6458],[3.5,-1,1,1,.6458,3.5,-1,-8,.8125,.6458,3.5,-1,-8,.8125,.6458,3.5,-1,1,1,.6458],[-3.5,-1,1,1.1458,.6458,3.5,-1,1,1,.6458,3.5,-1,1,1,.6458,-3.5,-1,1,1.1458,.6458]],children:[{name:"head",pose:[0,-2,-1,0,0,0],quads:[[3.5,-1,2,.8125,.2708,-3.5,-1,2,.6667,.2708,-3.5,-1,-7,.6667,.4583,3.5,-1,-7,.8125,.4583],[3.5,-1,-7,.9583,.4583,-3.5,-1,-7,.8125,.4583,-3.5,-1,2,.8125,.2708,3.5,-1,2,.9583,.2708],[-3.5,-1,-7,.6667,.4583,-3.5,-1,2,.4792,.4583,-3.5,-1,2,.4792,.4583,-3.5,-1,-7,.6667,.4583],[3.5,-1,-7,.8125,.4583,-3.5,-1,-7,.6667,.4583,-3.5,-1,-7,.6667,.4583,3.5,-1,-7,.8125,.4583],[3.5,-1,2,1,.4583,3.5,-1,-7,.8125,.4583,3.5,-1,-7,.8125,.4583,3.5,-1,2,1,.4583],[-3.5,-1,2,1.1458,.4583,3.5,-1,2,1,.4583,3.5,-1,2,1,.4583,-3.5,-1,2,1.1458,.4583],[3.5,-2,2,.3333,.2708,-3.5,-2,2,.1875,.2708,-3.5,-2,-7,.1875,.4583,3.5,-2,-7,.3333,.4583],[3.5,1,-7,.4792,.4583,-3.5,1,-7,.3333,.4583,-3.5,1,2,.3333,.2708,3.5,1,2,.4792,.2708],[-3.5,-2,-7,.1875,.4583,-3.5,-2,2,0,.4583,-3.5,1,2,0,.5208,-3.5,1,-7,.1875,.5208],[3.5,-2,-7,.3333,.4583,-3.5,-2,-7,.1875,.4583,-3.5,1,-7,.1875,.5208,3.5,1,-7,.3333,.5208],[3.5,-2,2,.5208,.4583,3.5,-2,-7,.3333,.4583,3.5,1,-7,.3333,.5208,3.5,1,2,.5208,.5208],[-3.5,-2,2,.6667,.4583,3.5,-2,2,.5208,.4583,3.5,1,2,.5208,.5208,-3.5,1,2,.6667,.5208]],children:[{name:"eyes",pose:[-.5,0,2,0,0,0],quads:[],children:[{name:"right_eye",pose:[-1.5,-3,-6.5,0,0,0],quads:[[1.5,-1,1.5,.125,0,-1.5,-1,1.5,.0625,0,-1.5,-1,-1.5,.0625,.0625,1.5,-1,-1.5,.125,.0625],[1.5,1,-1.5,.1875,.0625,-1.5,1,-1.5,.125,.0625,-1.5,1,1.5,.125,0,1.5,1,1.5,.1875,0],[-1.5,-1,-1.5,.0625,.0625,-1.5,-1,1.5,0,.0625,-1.5,1,1.5,0,.1042,-1.5,1,-1.5,.0625,.1042],[1.5,-1,-1.5,.125,.0625,-1.5,-1,-1.5,.0625,.0625,-1.5,1,-1.5,.0625,.1042,1.5,1,-1.5,.125,.1042],[1.5,-1,1.5,.1875,.0625,1.5,-1,-1.5,.125,.0625,1.5,1,-1.5,.125,.1042,1.5,1,1.5,.1875,.1042],[-1.5,-1,1.5,.25,.0625,1.5,-1,1.5,.1875,.0625,1.5,1,1.5,.1875,.1042,-1.5,1,1.5,.25,.1042]],children:[]},{name:"left_eye",pose:[2.5,-3,-6.5,0,0,0],quads:[[1.5,-1,1.5,.125,.1042,-1.5,-1,1.5,.0625,.1042,-1.5,-1,-1.5,.0625,.1667,1.5,-1,-1.5,.125,.1667],[1.5,1,-1.5,.1875,.1667,-1.5,1,-1.5,.125,.1667,-1.5,1,1.5,.125,.1042,1.5,1,1.5,.1875,.1042],[-1.5,-1,-1.5,.0625,.1667,-1.5,-1,1.5,0,.1667,-1.5,1,1.5,0,.2083,-1.5,1,-1.5,.0625,.2083],[1.5,-1,-1.5,.125,.1667,-1.5,-1,-1.5,.0625,.1667,-1.5,1,-1.5,.0625,.2083,1.5,1,-1.5,.125,.2083],[1.5,-1,1.5,.1875,.1667,1.5,-1,-1.5,.125,.1667,1.5,1,-1.5,.125,.2083,1.5,1,1.5,.1875,.2083],[-1.5,-1,1.5,.25,.1667,1.5,-1,1.5,.1875,.1667,1.5,1,1.5,.1875,.2083,-1.5,1,1.5,.25,.2083]],children:[]}]}]},{name:"right_arm",pose:[-4,-1,-6.5,0,0,0],quads:[[1,0,2,.1042,.7917,-1,0,2,.0625,.7917,-1,0,-1,.0625,.8542,1,0,-1,.1042,.8542],[1,3,-1,.1458,.8542,-1,3,-1,.1042,.8542,-1,3,2,.1042,.7917,1,3,2,.1458,.7917],[-1,0,-1,.0625,.8542,-1,0,2,0,.8542,-1,3,2,0,.9167,-1,3,-1,.0625,.9167],[1,0,-1,.1042,.8542,-1,0,-1,.0625,.8542,-1,3,-1,.0625,.9167,1,3,-1,.1042,.9167],[1,0,2,.1667,.8542,1,0,-1,.1042,.8542,1,3,-1,.1042,.9167,1,3,2,.1667,.9167],[-1,0,2,.2083,.8542,1,0,2,.1667,.8542,1,3,2,.1667,.9167,-1,3,2,.2083,.9167]],children:[{name:"right_hand",pose:[0,3,0,0,0,0],quads:[[4,.01,3,.375,.8333,-4,.01,3,.2083,.8333,-4,.01,-5,.2083,1,4,.01,-5,.375,1],[4,.01,-5,.5417,1,-4,.01,-5,.375,1,-4,.01,3,.375,.8333,4,.01,3,.5417,.8333],[-4,.01,-5,.2083,1,-4,.01,3,.0417,1,-4,.01,3,.0417,1,-4,.01,-5,.2083,1],[4,.01,-5,.375,1,-4,.01,-5,.2083,1,-4,.01,-5,.2083,1,4,.01,-5,.375,1],[4,.01,3,.5417,1,4,.01,-5,.375,1,4,.01,-5,.375,1,4,.01,3,.5417,1],[-4,.01,3,.7083,1,4,.01,3,.5417,1,4,.01,3,.5417,1,-4,.01,3,.7083,1]],children:[]}]},{name:"tongue",pose:[0,-1.01,1,0,0,0],quads:[[2,0,-.1,.5833,.2708,-2,0,-.1,.5,.2708,-2,0,-7.1,.5,.4167,2,0,-7.1,.5833,.4167],[2,0,-7.1,.6667,.4167,-2,0,-7.1,.5833,.4167,-2,0,-.1,.5833,.2708,2,0,-.1,.6667,.2708],[-2,0,-7.1,.5,.4167,-2,0,-.1,.3542,.4167,-2,0,-.1,.3542,.4167,-2,0,-7.1,.5,.4167],[2,0,-7.1,.5833,.4167,-2,0,-7.1,.5,.4167,-2,0,-7.1,.5,.4167,2,0,-7.1,.5833,.4167],[2,0,-.1,.7292,.4167,2,0,-7.1,.5833,.4167,2,0,-7.1,.5833,.4167,2,0,-.1,.7292,.4167],[-2,0,-.1,.8125,.4167,2,0,-.1,.7292,.4167,2,0,-.1,.7292,.4167,-2,0,-.1,.8125,.4167]],children:[]},{name:"left_arm",pose:[4,-1,-6.5,0,0,0],quads:[[1,0,2,.1042,.6667,-1,0,2,.0625,.6667,-1,0,-1,.0625,.7292,1,0,-1,.1042,.7292],[1,3,-1,.1458,.7292,-1,3,-1,.1042,.7292,-1,3,2,.1042,.6667,1,3,2,.1458,.6667],[-1,0,-1,.0625,.7292,-1,0,2,0,.7292,-1,3,2,0,.7917,-1,3,-1,.0625,.7917],[1,0,-1,.1042,.7292,-1,0,-1,.0625,.7292,-1,3,-1,.0625,.7917,1,3,-1,.1042,.7917],[1,0,2,.1667,.7292,1,0,-1,.1042,.7292,1,3,-1,.1042,.7917,1,3,2,.1667,.7917],[-1,0,2,.2083,.7292,1,0,2,.1667,.7292,1,3,2,.1667,.7917,-1,3,2,.2083,.7917]],children:[{name:"left_hand",pose:[0,3,-1,0,0,0],quads:[[4,.01,4,.7083,.8333,-4,.01,4,.5417,.8333,-4,.01,-4,.5417,1,4,.01,-4,.7083,1],[4,.01,-4,.875,1,-4,.01,-4,.7083,1,-4,.01,4,.7083,.8333,4,.01,4,.875,.8333],[-4,.01,-4,.5417,1,-4,.01,4,.375,1,-4,.01,4,.375,1,-4,.01,-4,.5417,1],[4,.01,-4,.7083,1,-4,.01,-4,.5417,1,-4,.01,-4,.5417,1,4,.01,-4,.7083,1],[4,.01,4,.875,1,4,.01,-4,.7083,1,4,.01,-4,.7083,1,4,.01,4,.875,1],[-4,.01,4,1.0417,1,4,.01,4,.875,1,4,.01,4,.875,1,-4,.01,4,1.0417,1]],children:[]}]},{name:"croaking_body",pose:[0,-1,-5,0,0,0],quads:[[3.4,0,0,.75,.1042,-3.4,0,0,.6042,.1042,-3.4,0,-2.8,.6042,.1667,3.4,0,-2.8,.75,.1667],[3.4,1.8,-2.8,.8958,.1667,-3.4,1.8,-2.8,.75,.1667,-3.4,1.8,0,.75,.1042,3.4,1.8,0,.8958,.1042],[-3.4,0,-2.8,.6042,.1667,-3.4,0,0,.5417,.1667,-3.4,1.8,0,.5417,.2083,-3.4,1.8,-2.8,.6042,.2083],[3.4,0,-2.8,.75,.1667,-3.4,0,-2.8,.6042,.1667,-3.4,1.8,-2.8,.6042,.2083,3.4,1.8,-2.8,.75,.2083],[3.4,0,0,.8125,.1667,3.4,0,-2.8,.75,.1667,3.4,1.8,-2.8,.75,.2083,3.4,1.8,0,.8125,.2083],[-3.4,0,0,.9583,.1667,3.4,0,0,.8125,.1667,3.4,1.8,0,.8125,.2083,-3.4,1.8,0,.9583,.2083]],children:[]}]}]}]},fox:{name:"root",pose:[0,0,0,0,0,0],quads:[],children:[{name:"head",pose:[-1,16.5,-3,0,0,0],quads:[[5,-2,1,.3125,.1563,-3,-2,1,.1458,.1563,-3,-2,-5,.1458,.3438,5,-2,-5,.3125,.3438],[5,4,-5,.4792,.3438,-3,4,-5,.3125,.3438,-3,4,1,.3125,.1563,5,4,1,.4792,.1563],[-3,-2,-5,.1458,.3438,-3,-2,1,.0208,.3438,-3,4,1,.0208,.5313,-3,4,-5,.1458,.5313],[5,-2,-5,.3125,.3438,-3,-2,-5,.1458,.3438,-3,4,-5,.1458,.5313,5,4,-5,.3125,.5313],[5,-2,1,.4375,.3438,5,-2,-5,.3125,.3438,5,4,-5,.3125,.5313,5,4,1,.4375,.5313],[-3,-2,1,.6042,.3438,5,-2,1,.4375,.3438,5,4,1,.4375,.5313,-3,4,1,.6042,.5313]],children:[{name:"nose",pose:[0,0,0,0,0,0],quads:[[3,2.01,-5,.2708,.5625,-1,2.01,-5,.1875,.5625,-1,2.01,-8,.1875,.6563,3,2.01,-8,.2708,.6563],[3,4.01,-8,.3542,.6563,-1,4.01,-8,.2708,.6563,-1,4.01,-5,.2708,.5625,3,4.01,-5,.3542,.5625],[-1,2.01,-8,.1875,.6563,-1,2.01,-5,.125,.6563,-1,4.01,-5,.125,.7188,-1,4.01,-8,.1875,.7188],[3,2.01,-8,.2708,.6563,-1,2.01,-8,.1875,.6563,-1,4.01,-8,.1875,.7188,3,4.01,-8,.2708,.7188],[3,2.01,-5,.3333,.6563,3,2.01,-8,.2708,.6563,3,4.01,-8,.2708,.7188,3,4.01,-5,.3333,.7188],[-1,2.01,-5,.4167,.6563,3,2.01,-5,.3333,.6563,3,4.01,-5,.3333,.7188,-1,4.01,-5,.4167,.7188]],children:[]},{name:"right_ear",pose:[0,0,0,0,0,0],quads:[[-1,-4,-3,.2292,.0313,-3,-4,-3,.1875,.0313,-3,-4,-4,.1875,.0625,-1,-4,-4,.2292,.0625],[-1,-2,-4,.2708,.0625,-3,-2,-4,.2292,.0625,-3,-2,-3,.2292,.0313,-1,-2,-3,.2708,.0313],[-3,-4,-4,.1875,.0625,-3,-4,-3,.1667,.0625,-3,-2,-3,.1667,.125,-3,-2,-4,.1875,.125],[-1,-4,-4,.2292,.0625,-3,-4,-4,.1875,.0625,-3,-2,-4,.1875,.125,-1,-2,-4,.2292,.125],[-1,-4,-3,.25,.0625,-1,-4,-4,.2292,.0625,-1,-2,-4,.2292,.125,-1,-2,-3,.25,.125],[-3,-4,-3,.2917,.0625,-1,-4,-3,.25,.0625,-1,-2,-3,.25,.125,-3,-2,-3,.2917,.125]],children:[]},{name:"left_ear",pose:[0,0,0,0,0,0],quads:[[5,-4,-3,.375,.0313,3,-4,-3,.3333,.0313,3,-4,-4,.3333,.0625,5,-4,-4,.375,.0625],[5,-2,-4,.4167,.0625,3,-2,-4,.375,.0625,3,-2,-3,.375,.0313,5,-2,-3,.4167,.0313],[3,-4,-4,.3333,.0625,3,-4,-3,.3125,.0625,3,-2,-3,.3125,.125,3,-2,-4,.3333,.125],[5,-4,-4,.375,.0625,3,-4,-4,.3333,.0625,3,-2,-4,.3333,.125,5,-2,-4,.375,.125],[5,-4,-3,.3958,.0625,5,-4,-4,.375,.0625,5,-2,-4,.375,.125,5,-2,-3,.3958,.125],[3,-4,-3,.4375,.0625,5,-4,-3,.3958,.0625,5,-2,-3,.3958,.125,3,-2,-3,.4375,.125]],children:[]}]},{name:"right_front_leg",pose:[-5,17.5,0,0,0,0],quads:[[4,.5,1,.3542,.75,2,.5,1,.3125,.75,2,.5,-1,.3125,.8125,4,.5,-1,.3542,.8125],[4,6.5,-1,.3958,.8125,2,6.5,-1,.3542,.8125,2,6.5,1,.3542,.75,4,6.5,1,.3958,.75],[2,.5,-1,.3125,.8125,2,.5,1,.2708,.8125,2,6.5,1,.2708,1,2,6.5,-1,.3125,1],[4,.5,-1,.3542,.8125,2,.5,-1,.3125,.8125,2,6.5,-1,.3125,1,4,6.5,-1,.3542,1],[4,.5,1,.3958,.8125,4,.5,-1,.3542,.8125,4,6.5,-1,.3542,1,4,6.5,1,.3958,1],[2,.5,1,.4375,.8125,4,.5,1,.3958,.8125,4,6.5,1,.3958,1,2,6.5,1,.4375,1]],children:[]},{name:"right_hind_leg",pose:[-5,17.5,7,0,0,0],quads:[[4,.5,1,.3542,.75,2,.5,1,.3125,.75,2,.5,-1,.3125,.8125,4,.5,-1,.3542,.8125],[4,6.5,-1,.3958,.8125,2,6.5,-1,.3542,.8125,2,6.5,1,.3542,.75,4,6.5,1,.3958,.75],[2,.5,-1,.3125,.8125,2,.5,1,.2708,.8125,2,6.5,1,.2708,1,2,6.5,-1,.3125,1],[4,.5,-1,.3542,.8125,2,.5,-1,.3125,.8125,2,6.5,-1,.3125,1,4,6.5,-1,.3542,1],[4,.5,1,.3958,.8125,4,.5,-1,.3542,.8125,4,6.5,-1,.3542,1,4,6.5,1,.3958,1],[2,.5,1,.4375,.8125,4,.5,1,.3958,.8125,4,6.5,1,.3958,1,2,6.5,1,.4375,1]],children:[]},{name:"left_hind_leg",pose:[-1,17.5,7,0,0,0],quads:[[4,.5,1,.1667,.75,2,.5,1,.125,.75,2,.5,-1,.125,.8125,4,.5,-1,.1667,.8125],[4,6.5,-1,.2083,.8125,2,6.5,-1,.1667,.8125,2,6.5,1,.1667,.75,4,6.5,1,.2083,.75],[2,.5,-1,.125,.8125,2,.5,1,.0833,.8125,2,6.5,1,.0833,1,2,6.5,-1,.125,1],[4,.5,-1,.1667,.8125,2,.5,-1,.125,.8125,2,6.5,-1,.125,1,4,6.5,-1,.1667,1],[4,.5,1,.2083,.8125,4,.5,-1,.1667,.8125,4,6.5,-1,.1667,1,4,6.5,1,.2083,1],[2,.5,1,.25,.8125,4,.5,1,.2083,.8125,4,6.5,1,.2083,1,2,6.5,1,.25,1]],children:[]},{name:"body",pose:[0,16,-6,1.5708,0,0],quads:[[3,4,2.5,.75,.4688,-3,4,2.5,.625,.4688,-3,4,-3.5,.625,.6563,3,4,-3.5,.75,.6563],[3,15,-3.5,.875,.6563,-3,15,-3.5,.75,.6563,-3,15,2.5,.75,.4688,3,15,2.5,.875,.4688],[-3,4,-3.5,.625,.6563,-3,4,2.5,.5,.6563,-3,15,2.5,.5,1,-3,15,-3.5,.625,1],[3,4,-3.5,.75,.6563,-3,4,-3.5,.625,.6563,-3,15,-3.5,.625,1,3,15,-3.5,.75,1],[3,4,2.5,.875,.6563,3,4,-3.5,.75,.6563,3,15,-3.5,.75,1,3,15,2.5,.875,1],[-3,4,2.5,1,.6563,3,4,2.5,.875,.6563,3,15,2.5,.875,1,-3,15,2.5,1,1]],children:[{name:"tail",pose:[-4,15,-1,-.0524,0,0],quads:[[6,0,4,.8125,0,2,0,4,.7292,0,2,0,-1,.7292,.1563,6,0,-1,.8125,.1563],[6,9,-1,.8958,.1563,2,9,-1,.8125,.1563,2,9,4,.8125,0,6,9,4,.8958,0],[2,0,-1,.7292,.1563,2,0,4,.625,.1563,2,9,4,.625,.4375,2,9,-1,.7292,.4375],[6,0,-1,.8125,.1563,2,0,-1,.7292,.1563,2,9,-1,.7292,.4375,6,9,-1,.8125,.4375],[6,0,4,.9167,.1563,6,0,-1,.8125,.1563,6,9,-1,.8125,.4375,6,9,4,.9167,.4375],[2,0,4,1,.1563,6,0,4,.9167,.1563,6,9,4,.9167,.4375,2,9,4,1,.4375]],children:[]}]},{name:"left_front_leg",pose:[-1,17.5,0,0,0,0],quads:[[4,.5,1,.1667,.75,2,.5,1,.125,.75,2,.5,-1,.125,.8125,4,.5,-1,.1667,.8125],[4,6.5,-1,.2083,.8125,2,6.5,-1,.1667,.8125,2,6.5,1,.1667,.75,4,6.5,1,.2083,.75],[2,.5,-1,.125,.8125,2,.5,1,.0833,.8125,2,6.5,1,.0833,1,2,6.5,-1,.125,1],[4,.5,-1,.1667,.8125,2,.5,-1,.125,.8125,2,6.5,-1,.125,1,4,6.5,-1,.1667,1],[4,.5,1,.2083,.8125,4,.5,-1,.1667,.8125,4,6.5,-1,.1667,1,4,6.5,1,.2083,1],[2,.5,1,.25,.8125,4,.5,1,.2083,.8125,4,6.5,1,.2083,1,2,6.5,1,.25,1]],children:[]}]}};var ul={duszek_haze:{name:"root",pose:[0,0,0,0,0,0],quads:[],children:[{name:"box0",pose:[2,22,-2,0,0,0],children:[],quads:[[0,-4,4,.5,0,-4,-4,4,.4375,0,-4,-4,0,.4375,.0625,0,-4,0,.5,.0625],[0,0,0,.5625,.0625,-4,0,0,.5,.0625,-4,0,4,.5,0,0,0,4,.5625,0],[-4,-4,0,.4375,.0625,-4,-4,4,.375,.0625,-4,0,4,.375,.125,-4,0,0,.4375,.125],[0,-4,0,.5,.0625,-4,-4,0,.4375,.0625,-4,0,0,.4375,.125,0,0,0,.5,.125],[0,-4,4,.5625,.0625,0,-4,0,.5,.0625,0,0,0,.5,.125,0,0,4,.5625,.125],[-4,-4,4,.625,.0625,0,-4,4,.5625,.0625,0,0,4,.5625,.125,-4,0,4,.625,.125]]},{name:"box1",pose:[1,18,-1,0,0,0],children:[],quads:[[-.5,-4,1.5,.96875,0,-1.5,-4,1.5,.95313,0,-1.5,-4,.5,.95313,.01563,-.5,-4,.5,.96875,.01563],[-.5,0,.5,.98438,.01563,-1.5,0,.5,.96875,.01563,-1.5,0,1.5,.96875,0,-.5,0,1.5,.98438,0],[-1.5,-4,.5,.95313,.01563,-1.5,-4,1.5,.9375,.01563,-1.5,0,1.5,.9375,.07813,-1.5,0,.5,.95313,.07813],[-.5,-4,.5,.96875,.01563,-1.5,-4,.5,.95313,.01563,-1.5,0,.5,.95313,.07813,-.5,0,.5,.96875,.07813],[-.5,-4,1.5,.98438,.01563,-.5,-4,.5,.96875,.01563,-.5,0,.5,.96875,.07813,-.5,0,1.5,.98438,.07813],[-1.5,-4,1.5,1,.01563,-.5,-4,1.5,.98438,.01563,-.5,0,1.5,.98438,.07813,-1.5,0,1.5,1,.07813]]},{name:"box2",pose:[-.5,14,-1,0,0,-.2618],children:[],quads:[[0,0,2.5,.125,.1875,-5,0,2.5,.04688,.1875,-5,0,-.5,.04688,.23438,0,0,-.5,.125,.23438],[0,.01,-.5,.20313,.23438,-5,.01,-.5,.125,.23438,-5,.01,2.5,.125,.1875,0,.01,2.5,.20313,.1875],[-5,0,-.5,.04688,.23438,-5,0,2.5,0,.23438,-5,.01,2.5,0,.23453,-5,.01,-.5,.04688,.23453],[0,0,-.5,.125,.23438,-5,0,-.5,.04688,.23438,-5,.01,-.5,.04688,.23453,0,.01,-.5,.125,.23453],[0,0,2.5,.17188,.23438,0,0,-.5,.125,.23438,0,.01,-.5,.125,.23453,0,.01,2.5,.17188,.23453],[-5,0,2.5,.25,.23438,0,0,2.5,.17188,.23438,0,.01,2.5,.17188,.23453,-5,.01,2.5,.25,.23453]]},{name:"box3",pose:[-.5,14,-1,0,0,-.2618],children:[],quads:[[0,0,2.51,.29703,.1875,-3,0,2.51,.25016,.1875,-3,0,2.5,.25016,.18766,0,0,2.5,.29703,.18766],[0,1,2.5,.34391,.18766,-3,1,2.5,.29703,.18766,-3,1,2.51,.29703,.1875,0,1,2.51,.34391,.1875],[-3,0,2.5,.25016,.18766,-3,0,2.51,.25,.18766,-3,1,2.51,.25,.20328,-3,1,2.5,.25016,.20328],[0,0,2.5,.29703,.18766,-3,0,2.5,.25016,.18766,-3,1,2.5,.25016,.20328,0,1,2.5,.29703,.20328],[0,0,2.51,.29719,.18766,0,0,2.5,.29703,.18766,0,1,2.5,.29703,.20328,0,1,2.51,.29719,.20328],[-3,0,2.51,.34406,.18766,0,0,2.51,.29719,.18766,0,1,2.51,.29719,.20328,-3,1,2.51,.34406,.20328]]},{name:"box4",pose:[-.5,14,-1,0,0,-.2618],children:[],quads:[[0,0,-.49,.42203,.1875,-3,0,-.49,.37516,.1875,-3,0,-.5,.37516,.18766,0,0,-.5,.42203,.18766],[0,1,-.5,.46891,.18766,-3,1,-.5,.42203,.18766,-3,1,-.49,.42203,.1875,0,1,-.49,.46891,.1875],[-3,0,-.5,.37516,.18766,-3,0,-.49,.375,.18766,-3,1,-.49,.375,.20328,-3,1,-.5,.37516,.20328],[0,0,-.5,.42203,.18766,-3,0,-.5,.37516,.18766,-3,1,-.5,.37516,.20328,0,1,-.5,.42203,.20328],[0,0,-.49,.42219,.18766,0,0,-.5,.42203,.18766,0,1,-.5,.42203,.20328,0,1,-.49,.42219,.20328],[-3,0,-.49,.46906,.18766,0,0,-.49,.42219,.18766,0,1,-.49,.42219,.20328,-3,1,-.49,.46906,.20328]]},{name:"box5",pose:[-.5,14,-1,0,0,-.2618],children:[],quads:[[-4.99,0,1.5,.51578,.1875,-5,0,1.5,.51563,.1875,-5,0,.5,.51563,.20313,-4.99,0,.5,.51578,.20313],[-4.99,1,.5,.51594,.20313,-5,1,.5,.51578,.20313,-5,1,1.5,.51578,.1875,-4.99,1,1.5,.51594,.1875],[-5,0,.5,.51563,.20313,-5,0,1.5,.5,.20313,-5,1,1.5,.5,.21875,-5,1,.5,.51563,.21875],[-4.99,0,.5,.51578,.20313,-5,0,.5,.51563,.20313,-5,1,.5,.51563,.21875,-4.99,1,.5,.51578,.21875],[-4.99,0,1.5,.53141,.20313,-4.99,0,.5,.51578,.20313,-4.99,1,.5,.51578,.21875,-4.99,1,1.5,.53141,.21875],[-5,0,1.5,.53156,.20313,-4.99,0,1.5,.53141,.20313,-4.99,1,1.5,.53141,.21875,-5,1,1.5,.53156,.21875]]},{name:"box6",pose:[-.5,14,-1,0,0,-.2618],children:[],quads:[[.01,0,2.5,.60953,.1875,0,0,2.5,.60938,.1875,0,0,-.5,.60938,.23438,.01,0,-.5,.60953,.23438],[.01,1,-.5,.60969,.23438,0,1,-.5,.60953,.23438,0,1,2.5,.60953,.1875,.01,1,2.5,.60969,.1875],[0,0,-.5,.60938,.23438,0,0,2.5,.5625,.23438,0,1,2.5,.5625,.25,0,1,-.5,.60938,.25],[.01,0,-.5,.60953,.23438,0,0,-.5,.60938,.23438,0,1,-.5,.60938,.25,.01,1,-.5,.60953,.25],[.01,0,2.5,.65641,.23438,.01,0,-.5,.60953,.23438,.01,1,-.5,.60953,.25,.01,1,2.5,.65641,.25],[0,0,2.5,.65656,.23438,.01,0,2.5,.65641,.23438,.01,1,2.5,.65641,.25,0,1,2.5,.65656,.25]]},{name:"box7",pose:[.3,14,0,0,0,.1309],children:[],quads:[[5.2,0,1.5,.8125,.1875,.2,0,1.5,.73438,.1875,.2,0,-1.5,.73438,.23438,5.2,0,-1.5,.8125,.23438],[5.2,.01,-1.5,.89063,.23438,.2,.01,-1.5,.8125,.23438,.2,.01,1.5,.8125,.1875,5.2,.01,1.5,.89063,.1875],[.2,0,-1.5,.73438,.23438,.2,0,1.5,.6875,.23438,.2,.01,1.5,.6875,.23453,.2,.01,-1.5,.73438,.23453],[5.2,0,-1.5,.8125,.23438,.2,0,-1.5,.73438,.23438,.2,.01,-1.5,.73438,.23453,5.2,.01,-1.5,.8125,.23453],[5.2,0,1.5,.85938,.23438,5.2,0,-1.5,.8125,.23438,5.2,.01,-1.5,.8125,.23453,5.2,.01,1.5,.85938,.23453],[.2,0,1.5,.9375,.23438,5.2,0,1.5,.85938,.23438,5.2,.01,1.5,.85938,.23453,.2,.01,1.5,.9375,.23453]]},{name:"box8",pose:[.3,14,0,0,0,.1309],children:[],quads:[[3.2,0,1.51,.04703,.25,.2,0,1.51,16e-5,.25,.2,0,1.5,16e-5,.25016,3.2,0,1.5,.04703,.25016],[3.2,1,1.5,.09391,.25016,.2,1,1.5,.04703,.25016,.2,1,1.51,.04703,.25,3.2,1,1.51,.09391,.25],[.2,0,1.5,16e-5,.25016,.2,0,1.51,0,.25016,.2,1,1.51,0,.26578,.2,1,1.5,16e-5,.26578],[3.2,0,1.5,.04703,.25016,.2,0,1.5,16e-5,.25016,.2,1,1.5,16e-5,.26578,3.2,1,1.5,.04703,.26578],[3.2,0,1.51,.04719,.25016,3.2,0,1.5,.04703,.25016,3.2,1,1.5,.04703,.26578,3.2,1,1.51,.04719,.26578],[.2,0,1.51,.09406,.25016,3.2,0,1.51,.04719,.25016,3.2,1,1.51,.04719,.26578,.2,1,1.51,.09406,.26578]]},{name:"box9",pose:[.3,14,0,0,0,.1309],children:[],quads:[[3.2,0,-1.49,.17203,.25,.2,0,-1.49,.12516,.25,.2,0,-1.5,.12516,.25016,3.2,0,-1.5,.17203,.25016],[3.2,1,-1.5,.21891,.25016,.2,1,-1.5,.17203,.25016,.2,1,-1.49,.17203,.25,3.2,1,-1.49,.21891,.25],[.2,0,-1.5,.12516,.25016,.2,0,-1.49,.125,.25016,.2,1,-1.49,.125,.26578,.2,1,-1.5,.12516,.26578],[3.2,0,-1.5,.17203,.25016,.2,0,-1.5,.12516,.25016,.2,1,-1.5,.12516,.26578,3.2,1,-1.5,.17203,.26578],[3.2,0,-1.49,.17219,.25016,3.2,0,-1.5,.17203,.25016,3.2,1,-1.5,.17203,.26578,3.2,1,-1.49,.17219,.26578],[.2,0,-1.49,.21906,.25016,3.2,0,-1.49,.17219,.25016,3.2,1,-1.49,.17219,.26578,.2,1,-1.49,.21906,.26578]]},{name:"box10",pose:[.3,14,0,0,0,.1309],children:[],quads:[[5.21,0,.5,.26578,.25,5.2,0,.5,.26563,.25,5.2,0,-.5,.26563,.26563,5.21,0,-.5,.26578,.26563],[5.21,1,-.5,.26594,.26563,5.2,1,-.5,.26578,.26563,5.2,1,.5,.26578,.25,5.21,1,.5,.26594,.25],[5.2,0,-.5,.26563,.26563,5.2,0,.5,.25,.26563,5.2,1,.5,.25,.28125,5.2,1,-.5,.26563,.28125],[5.21,0,-.5,.26578,.26563,5.2,0,-.5,.26563,.26563,5.2,1,-.5,.26563,.28125,5.21,1,-.5,.26578,.28125],[5.21,0,.5,.28141,.26563,5.21,0,-.5,.26578,.26563,5.21,1,-.5,.26578,.28125,5.21,1,.5,.28141,.28125],[5.2,0,.5,.28156,.26563,5.21,0,.5,.28141,.26563,5.21,1,.5,.28141,.28125,5.2,1,.5,.28156,.28125]]},{name:"box11",pose:[.3,14,0,0,0,.1309],children:[],quads:[[.21,0,1.5,.35953,.25,.2,0,1.5,.35938,.25,.2,0,-1.5,.35938,.29688,.21,0,-1.5,.35953,.29688],[.21,1,-1.5,.35969,.29688,.2,1,-1.5,.35953,.29688,.2,1,1.5,.35953,.25,.21,1,1.5,.35969,.25],[.2,0,-1.5,.35938,.29688,.2,0,1.5,.3125,.29688,.2,1,1.5,.3125,.3125,.2,1,-1.5,.35938,.3125],[.21,0,-1.5,.35953,.29688,.2,0,-1.5,.35938,.29688,.2,1,-1.5,.35938,.3125,.21,1,-1.5,.35953,.3125],[.21,0,1.5,.40641,.29688,.21,0,-1.5,.35953,.29688,.21,1,-1.5,.35953,.3125,.21,1,1.5,.40641,.3125],[.2,0,1.5,.40656,.29688,.21,0,1.5,.40641,.29688,.21,1,1.5,.40641,.3125,.2,1,1.5,.40656,.3125]]},{name:"box12",pose:[1,24,-2,0,0,0],children:[],quads:[[2,-7,5,.1875,0,-4,-7,5,.09375,0,-4,-7,-1,.09375,.09375,2,-7,-1,.1875,.09375],[2,-1,-1,.28125,.09375,-4,-1,-1,.1875,.09375,-4,-1,5,.1875,0,2,-1,5,.28125,0],[-4,-7,-1,.09375,.09375,-4,-7,5,0,.09375,-4,-1,5,0,.1875,-4,-1,-1,.09375,.1875],[2,-7,-1,.1875,.09375,-4,-7,-1,.09375,.09375,-4,-1,-1,.09375,.1875,2,-1,-1,.1875,.1875],[2,-7,5,.28125,.09375,2,-7,-1,.1875,.09375,2,-1,-1,.1875,.1875,2,-1,5,.28125,.1875],[-4,-7,5,.375,.09375,2,-7,5,.28125,.09375,2,-1,5,.28125,.1875,-4,-1,5,.375,.1875]]},{name:"box13",pose:[-2,19,0,0,0,.56723],children:[],quads:[[0,0,1,.67188,0,-1,0,1,.65625,0,-1,0,-1,.65625,.03125,0,0,-1,.67188,.03125],[0,3,-1,.6875,.03125,-1,3,-1,.67188,.03125,-1,3,1,.67188,0,0,3,1,.6875,0],[-1,0,-1,.65625,.03125,-1,0,1,.625,.03125,-1,3,1,.625,.07813,-1,3,-1,.65625,.07813],[0,0,-1,.67188,.03125,-1,0,-1,.65625,.03125,-1,3,-1,.65625,.07813,0,3,-1,.67188,.07813],[0,0,1,.70313,.03125,0,0,-1,.67188,.03125,0,3,-1,.67188,.07813,0,3,1,.70313,.07813],[-1,0,1,.71875,.03125,0,0,1,.70313,.03125,0,3,1,.70313,.07813,-1,3,1,.71875,.07813]]},{name:"box14",pose:[2,19,0,0,0,-.56723],children:[],quads:[[1,0,1,.76563,0,0,0,1,.75,0,0,0,-1,.75,.03125,1,0,-1,.76563,.03125],[1,3,-1,.78125,.03125,0,3,-1,.76563,.03125,0,3,1,.76563,0,1,3,1,.78125,0],[0,0,-1,.75,.03125,0,0,1,.71875,.03125,0,3,1,.71875,.07813,0,3,-1,.75,.07813],[1,0,-1,.76563,.03125,0,0,-1,.75,.03125,0,3,-1,.75,.07813,1,3,-1,.76563,.07813],[1,0,1,.79688,.03125,1,0,-1,.76563,.03125,1,3,-1,.76563,.07813,1,3,1,.79688,.07813],[0,0,1,.8125,.03125,1,0,1,.79688,.03125,1,3,1,.79688,.07813,0,3,1,.8125,.07813]]},{name:"box15",pose:[-2,23,-1,0,0,-.1309],children:[],quads:[[1,0,1,.84375,0,0,0,1,.82813,0,0,0,0,.82813,.01563,1,0,0,.84375,.01563],[1,1,0,.85938,.01563,0,1,0,.84375,.01563,0,1,1,.84375,0,1,1,1,.85938,0],[0,0,0,.82813,.01563,0,0,1,.8125,.01563,0,1,1,.8125,.03125,0,1,0,.82813,.03125],[1,0,0,.84375,.01563,0,0,0,.82813,.01563,0,1,0,.82813,.03125,1,1,0,.84375,.03125],[1,0,1,.85938,.01563,1,0,0,.84375,.01563,1,1,0,.84375,.03125,1,1,1,.85938,.03125],[0,0,1,.875,.01563,1,0,1,.85938,.01563,1,1,1,.85938,.03125,0,1,1,.875,.03125]]},{name:"box16",pose:[2,23,0,-.2618,0,0],children:[],quads:[[0,0,0,.90625,0,-1,0,0,.89063,0,-1,0,-1,.89063,.01563,0,0,-1,.90625,.01563],[0,1,-1,.92188,.01563,-1,1,-1,.90625,.01563,-1,1,0,.90625,0,0,1,0,.92188,0],[-1,0,-1,.89063,.01563,-1,0,0,.875,.01563,-1,1,0,.875,.03125,-1,1,-1,.89063,.03125],[0,0,-1,.90625,.01563,-1,0,-1,.89063,.01563,-1,1,-1,.89063,.03125,0,1,-1,.90625,.03125],[0,0,0,.92188,.01563,0,0,-1,.90625,.01563,0,1,-1,.90625,.03125,0,1,0,.92188,.03125],[-1,0,0,.9375,.01563,0,0,0,.92188,.01563,0,1,0,.92188,.03125,-1,1,0,.9375,.03125]]}]}},dl={duszek_haze:2};var pl=[64,64];var fl=[{from:[-2.5,9,-2.75],size:[5,2.5,5.25]},{from:[-2.75,11.25,-3.25],size:[5.5,.75,6]}];function Cn(i){return[...i.map(e=>({bone:"right_leg",...e})),...i.map(e=>({bone:"left_leg",...e,inflate:(e.inflate??0)-.02}))]}function jp(i){return{...i,from:[-(i.from[0]+i.size[0]),i.from[1],i.from[2]]}}function ja(i){return[...i.map(e=>({bone:"right_arm",...e})),...ur(i)]}function ur(i){return i.map(e=>({bone:"left_arm",...jp(e)}))}var Jp=[{id:"tophat",slot:"hat",name:"Cylinder",boxes:[{bone:"head",from:[-6,-9,-6],size:[12,1,12]},{bone:"head",from:[-3.5,-16,-3.5],size:[7,7,7]}]},{id:"crown",slot:"hat",name:"Korona",boxes:[{bone:"head",from:[-4,-11,-4],size:[8,4,8],inflate:.75}]},{id:"cap",slot:"hat",name:"Czapka z daszkiem",boxes:[{bone:"head",from:[-4,-9,-4],size:[8,3,8],inflate:.75},{bone:"head",from:[-4,-6.5,-9],size:[8,1,4]}]},{id:"headphones",slot:"hat",name:"S\u0142uchawki",boxes:[{bone:"head",from:[-5,-10,-1],size:[10,1,2]},{bone:"head",from:[-5,-9,-1],size:[1,3,2]},{bone:"head",from:[4,-9,-1],size:[1,3,2]},{bone:"head",from:[-6,-6,-2],size:[2,4,4]},{bone:"head",from:[4,-6,-2],size:[2,4,4]}]},{id:"beanie",slot:"hat",name:"Czapka zimowa",boxes:[{bone:"head",from:[-4,-9,-4],size:[8,4,8],inflate:.75},{bone:"head",from:[-1.5,-12.5,-1.5],size:[3,3,3]}]},{id:"wizard",slot:"hat",name:"Kapelusz czarodzieja",boxes:[{bone:"head",from:[-6.5,-9,-6.5],size:[13,1,13]},{bone:"head",from:[-3.5,-12,-3.5],size:[7,3,7]},{bone:"head",from:[-2.5,-15,-2],size:[5,3,5]},{bone:"head",from:[-1.5,-18,-.5],size:[3,3,3]},{bone:"head",from:[-.5,-20,.5],size:[1,2,1]}]},{id:"halo",slot:"hat",name:"Aureola",boxes:[{bone:"head",from:[-3,-12,-3],size:[6,1,6]}]},{id:"scarf",slot:"top",name:"Szalik",boxes:[{bone:"body",from:[-4,.5,-2],size:[8,2,4],inflate:.6},{bone:"body",from:[1,3,-3.6],size:[2,6,1]}]},{id:"bowtie",slot:"top",name:"Muszka",boxes:[{bone:"body",from:[-3,.5,-3.25],size:[2,2,1]},{bone:"body",from:[1,.5,-3.25],size:[2,2,1]},{bone:"body",from:[-1,1,-3.5],size:[2,1,1]}]},{id:"tie",slot:"top",name:"Krawat",boxes:[{bone:"body",from:[-1,.5,-3.25],size:[2,1,1]},{bone:"body",from:[-1,1.5,-2.75],size:[2,7,.5]}]},{id:"medal",slot:"top",name:"Medal",boxes:[{bone:"body",from:[-4,0,-2],size:[8,1,4],inflate:.45},{bone:"body",from:[-1,1.5,-2.75],size:[2,3,.5]},{bone:"body",from:[-1.5,4,-3.25],size:[3,3,1]}]},{id:"jacket",slot:"top",name:"Kurtka",boxes:[{bone:"body",from:[-4,0,-2],size:[8,12,4],inflate:.4},{bone:"right_arm",from:[-3,-2,-2],size:[4,10,4],inflate:.4},{bone:"left_arm",from:[-1,-2,-2],size:[4,10,4],inflate:.4}]},{id:"sneakers_red",slot:"shoes",name:"Trampki czerwone",boxes:Cn(fl)},{id:"sneakers_blue",slot:"shoes",name:"Trampki niebieskie",boxes:Cn(fl)},{id:"hikingboots",slot:"shoes",name:"Traperki",boxes:Cn([{from:[-2.5,6.5,-2.5],size:[5,5,5]},{from:[-2.5,9.5,-3.25],size:[5,2,.75]},{from:[-2.75,11.5,-3.5],size:[5.5,.5,6.25]}])},{id:"slippers",slot:"shoes",name:"Kapcie",boxes:Cn([{from:[-2.5,10,-3],size:[5,1.5,5.5]},{from:[-2.75,11.5,-3.25],size:[5.5,.5,6]},{from:[-.75,9.25,-3],size:[1.5,.75,1]}])},{id:"bunnyslippers",slot:"shoes",name:"Kapcie kr\xF3liczki",boxes:Cn([{from:[-2.75,9.25,-3.5],size:[5.5,2.75,6.25]},{from:[-2,6.5,-3.25],size:[1,2.75,.5]},{from:[1,6.5,-3.25],size:[1,2.75,.5]}])},{id:"rocketboots",slot:"shoes",name:"Buty rakietowe",boxes:Cn([{from:[-2.5,7,-2.5],size:[5,4.5,5]},{from:[-2.75,11.5,-3],size:[5.5,.5,5.75]},{from:[-1.5,9.5,2.5],size:[3,2,1]}])},{id:"rollerskates",slot:"shoes",name:"Wrotki",boxes:Cn([{from:[-2.5,7.75,-2.75],size:[5,3,5.25]},{from:[-2.5,10.75,-3],size:[5,.5,5.75]},{from:[-1.25,11.25,-2.25],size:[2.5,.5,4.5]},{from:[-2.75,11,-2.75],size:[1.25,1,1.25]},{from:[1.5,11,-2.75],size:[1.25,1,1.25]},{from:[-2.75,11,1.25],size:[1.25,1,1.25]},{from:[1.5,11,1.25],size:[1.25,1,1.25]}])},{id:"flippers",slot:"shoes",name:"P\u0142etwy",boxes:Cn([{from:[-2.5,9.5,-2.75],size:[5,2.5,5.25]},{from:[-3,11.5,-9],size:[6,.5,6.25]}])},{id:"boxinggloves",slot:"hands",name:"R\u0119kawice bokserskie",boxes:ja([{from:[-3,6,-2],size:[4,4,4],inflate:.9},{from:[-3,4,-2],size:[4,1.5,4],inflate:.6}])},{id:"wristwatch",slot:"hands",name:"Zegarek",boxes:ur([{from:[-3,6.5,-2],size:[4,1,4],inflate:.3},{from:[-3.65,6.25,-1],size:[.5,1.5,2]}])},{id:"bracelet",slot:"hands",name:"Bransoletka",boxes:ur([{from:[-3,6.25,-2],size:[4,.75,4],inflate:.3},{from:[-3.7,6.75,-.5],size:[.5,1,1]}])},{id:"spikedgauntlets",slot:"hands",name:"Kolczaste r\u0119kawice",boxes:ja([{from:[-3,4,-2],size:[4,6,4],inflate:.45},{from:[-4.4,5,-.5],size:[1,1,1]},{from:[-4.4,7.5,-.5],size:[1,1,1]},{from:[-2.25,8.25,-3.4],size:[1,1,1]},{from:[-.25,8.25,-3.4],size:[1,1,1]}])},{id:"mittens",slot:"hands",name:"R\u0119kawiczki zimowe",boxes:ja([{from:[-3,6.5,-2],size:[4,3.75,4],inflate:.55},{from:[-3,4.75,-2],size:[4,1.5,4],inflate:.75}])},{id:"goldring",slot:"hands",name:"Z\u0142oty pier\u015Bcie\u0144",boxes:[{bone:"right_arm",from:[-3,8.75,-2],size:[4,.5,4],inflate:.28},{bone:"right_arm",from:[-1.5,8.5,-2.75],size:[1,1,.5]}]},{id:"smartband",slot:"hands",name:"Opaska sportowa",boxes:ur([{from:[-3,6.25,-2],size:[4,1.25,4],inflate:.3},{from:[-3.65,6.25,-1.25],size:[.5,1.25,2.5]}])}];function ml(i){if(i.bone!=="right_arm"&&i.bone!=="left_arm")return i;let[e,t]=i.bone==="right_arm"?[-3,1]:[-1,3],[n,s,r]=i.from,[o,a,l]=i.size;if(n<=e&&n+o>=t)return i.bone==="right_arm"?{...i,from:[n+1,s,r],size:[o-1,a,l]}:{...i,size:[o-1,a,l]};let c=i.bone==="right_arm"?t:e,h=n+o/2;return{...i,from:[Math.round((c+(h-c)*.75-o/2)*1e3)/1e3,s,r]}}function gl(i){let[e]=pl,t=0,n=0,s=0;return i.boxes.map(r=>{let[o,a,l]=r.size.map(Math.ceil),c=2*(o+l),h=l+a;t+c>e&&(t=0,n+=s,s=0);let d=[t,n];return t+=c,s=Math.max(s,h),d})}function _l(i,[e,t]){let[n,s]=pl,[r,o,a]=i.size,l=i.inflate??0,c=i.from[0]-l,h=i.from[1]-l,d=i.from[2]-l,f=i.from[0]+r+l,m=i.from[1]+o+l,g=i.from[2]+a+l,_=[c,h,d],p=[f,h,d],u=[f,m,d],S=[c,m,d],y=[c,h,g],R=[f,h,g],w=[f,m,g],P=[c,m,g],T=e,k=e+a,v=e+a+r,E=e+a+r+r,Z=e+a+r+a,te=e+a+r+a+r,F=t,H=t+a,V=t+a+o,K=(X,q,J,$,O,Y)=>({face:X,corners:[[...q[0],O/n,$/s],[...q[1],J/n,$/s],[...q[2],J/n,Y/s],[...q[3],O/n,Y/s]]});return[K("down",[R,y,_,p],k,F,v,H),K("up",[u,S,P,w],v,H,E,F),K("west",[_,y,P,S],T,H,k,V),K("north",[p,_,S,u],k,H,v,V),K("east",[R,p,u,w],v,H,Z,V),K("south",[y,R,w,P],Z,H,te,V)]}var xl=i=>Jp.find(e=>e.id===i);var yl={dot:{rows:[".ww.","wwww","wwww",".ww."],palette:{w:"#ffffff"}},spark:{rows:["..w..","..w..","wwwww","..w..","..w.."],palette:{w:"#ffffff"}},heart:{rows:[".rr.rr.","rpprrrr","rprrrrr",".rrrrr.","..rrr..","...r..."],palette:{r:"#ff3b5c",p:"#ffb3c1"}},coin:{rows:[".yyyy.","yllyyo","ylyyyo","yyyyyo","yyyyoo",".oooo."],palette:{y:"#ffd23f",l:"#fff3a8",o:"#c98a0a"}},ghost:{rows:["..wwww..",".wwwwww.","wwwwwwww","wkwwwkww","wkwwwkww","wwwwwwww","wwwwwwww","wwwwwwww","w.ww.ww."],palette:{w:"#f4f6ff",k:"#14141c"}},flame:{rows:["..y..",".yy..",".yoy.","yoooy","orrro",".rrr."],palette:{y:"#fff3a0",o:"#ffa21f",r:"#e8461b"}},soul:{rows:["..c..",".cc..",".cbc.","cbbbc","bdddb",".ddd."],palette:{c:"#d8ffff",b:"#5fe3f0",d:"#1f9fb4"}},puff:{rows:["..wwww..",".wwwwww.","wwwwwwww","wwwwwwww","wwwwwwww","wwwwwwww",".wwwwww.","..wwww.."],palette:{w:"#ffffff"}},ice:{rows:[".w.","wbw",".b."],palette:{w:"#ffffff",b:"#9fd8ff"}}},Ue=(i,e)=>i+Math.random()*(e-i);function Pn(){let i=Ue(-1,1),e=Ue(0,Math.PI*2),t=Math.sqrt(1-i*i);return[Math.cos(e)*t,i,Math.sin(e)*t]}var Ja=[16726843,16767291,3932014,3918079,12991487,16743129],Jn=i=>i[Math.floor(Math.random()*i.length)],vl={lightning:i=>{for(let[e,t,n]of[[0,15398655,2.2],[.12,12116735,1.4]]){let s=0,r=0;for(let o=60;o>-16;o-=1.6)s=Math.max(-8,Math.min(8,s+Ue(-1.6,1.6))),r=Math.max(-8,Math.min(8,r+Ue(-1.6,1.6))),i("dot",[s,o,r],{tint:t,life:.35,delay:e,size:n})}for(let e=0;e<18;e++){let t=Pn();i("spark",[0,-15,0],{v:[t[0]*30,Math.abs(t[1])*24,t[2]*30],tint:10479615,life:.5,drag:2,size:[2.2,.6]})}},blood:i=>{for(let e=0;e<34;e++){let t=Pn();i("dot",[Ue(-4,4),Ue(-10,10),Ue(-3,3)],{v:[t[0]*16,10+t[1]*10,t[2]*16],tint:Jn([7995392,11534336,9046538]),life:.9,gravity:-70,size:Ue(1.4,2.4)})}},heartburst:i=>{[0,.15,.3].forEach((e,t)=>{let n=8-t;for(let s=0;s<n;s++){let r=Math.PI*2*s/n+t;i("heart",[Math.cos(r)*(10+t*2),-2+t*7,Math.sin(r)*(10+t*2)],{v:[0,10,0],life:1,delay:e,size:[3,3.6]})}})},firework:i=>{let e=Jn(Ja),t=Jn(Ja);for(let n=0;n<46;n++){let s=Pn();i("dot",[0,12,0],{v:[s[0]*22,s[1]*22,s[2]*22],tint:n%2?e:t,life:1.1,drag:1.6,gravity:-10,size:[2,1]})}for(let n=0;n<14;n++){let s=Pn();i("spark",[0,12,0],{v:[s[0]*18,s[1]*18,s[2]*18],life:.7,drag:1.5,size:[2.4,.8]})}},soulrise:i=>{for(let e=0;e<16;e++){let t=Math.PI*2*e/16;i("soul",[Math.cos(t)*9,-15,Math.sin(t)*9],{v:[0,3,0],life:.8,size:2.4})}for(let e=0;e<14;e++)i("soul",[Ue(-5,5),Ue(-14,0),Ue(-3,3)],{v:[0,Ue(12,18),0],life:1.2,delay:e*.08,size:[3,2]})},enderpoof:i=>{for(let e=0;e<44;e++){let t=Pn();i("dot",[0,0,0],{v:[t[0]*22,t[1]*22,t[2]*22],tint:Jn([12611839,9055202,14721279]),life:.75,drag:1.2,size:[2.2,.4]})}for(let e=0;e<6;e++)i("puff",[Ue(-4,4),Ue(-8,8),Ue(-3,3)],{tint:15325439,life:.5,delay:.05,size:[3,8]})},confetti:i=>{for(let e=0;e<56;e++)i("dot",[Ue(-16,16),Ue(10,16),Ue(-12,12)],{v:[Ue(-4,4),Ue(2,8),Ue(-4,4)],tint:Jn(Ja),life:1.7,gravity:-22,drag:.6,size:1.8,aspect:.5,spin:Ue(-8,8)})},blast:i=>{i("puff",[0,0,0],{tint:16765562,life:.25,size:[8,16]});for(let e=0;e<8;e++){let t=Pn();i("puff",[t[0]*4,t[1]*8,t[2]*4],{v:[t[0]*10,t[1]*8+4,t[2]*10],tint:Jn([10132122,13158600,7237230]),life:.9,delay:.05,size:[4,11]})}for(let e=0;e<12;e++){let t=Pn();i("flame",[0,0,0],{v:[t[0]*26,t[1]*20,t[2]*26],life:.5,drag:2,size:[2.4,1]})}},shatter:i=>{for(let e=0;e<32;e++){let t=Pn();i("ice",[Ue(-4,4),Ue(-12,12),Ue(-3,3)],{v:[t[0]*22,12+t[1]*12,t[2]*22],tint:Jn([13628159,10475775,16777215]),life:1,gravity:-55,spin:Ue(-10,10),size:Ue(1.6,2.6)})}for(let e=0;e<12;e++)i("dot",[Ue(-10,10),Ue(-12,12),Ue(-8,8)],{tint:15268095,life:.6,size:[1.6,.2]})},coins:i=>{for(let e=0;e<20;e++)i("coin",[Ue(-2,2),2,Ue(-2,2)+4],{v:[Ue(-14,14),Ue(22,34),Ue(-10,14)],life:1.3,delay:e*.025,gravity:-85,size:2.6,flip:!0})},ghost:i=>{i("ghost",[0,-6,6],{v:[0,13,0],life:1.7,size:[8,7],sway:3});for(let e=0;e<5;e++)i("soul",[Ue(-4,4),Ue(-10,0),Ue(-3,3)],{v:[0,10,0],life:.8,size:2})},flamering:i=>{for(let[e,t]of[[0,28],[.2,20]])for(let n=0;n<t;n++){let s=Math.PI*2*n/t;i("flame",[Math.cos(s)*5,-15,Math.sin(s)*5],{v:[Math.cos(s)*22,2,Math.sin(s)*22],life:.8,delay:e,drag:.8,size:[2.8,1.4]})}}},$p=2.4,dr=class{constructor(e){this.holder=e}holder;parts=[];textures=new Map;kind="";wait=0;set(e){let t=e&&vl[e]?e:"";t!==this.kind&&(this.kind=t,this.wait=.25)}play(e){vl[e]?.(this.spawn)}update(e){this.kind&&(this.wait-=e)<=0&&(this.wait=$p,this.play(this.kind));for(let t of this.parts){if(t.delay>0){t.delay-=e,t.sprite.visible=t.delay<=0;continue}t.age+=e;let n=Math.max(0,1-t.drag*e);t.vx*=n,t.vz*=n,t.vy=t.vy*n+t.gravity*e,t.sprite.position.x+=t.vx*e+(t.sway?Math.cos(t.age*4)*t.sway*e*4:0),t.sprite.position.y+=t.vy*e,t.sprite.position.z+=t.vz*e;let s=Math.min(1,t.age/t.life),r=t.size[0]+(t.size[1]-t.size[0])*s,o=t.sprite.material;o.rotation+=t.spin*e,t.sprite.scale.set(r*(t.flip?Math.max(.15,Math.abs(Math.cos(t.age*10))):t.sprite.userData.aspect??1),r,1),o.opacity=Math.min(1,(1-s)*3)}for(let t of this.parts.filter(n=>n.age>=n.life))this.holder.remove(t.sprite),t.sprite.material.dispose();this.parts=this.parts.filter(t=>t.age<t.life)}dispose(){for(let e of this.parts)this.holder.remove(e.sprite),e.sprite.material.dispose();this.parts=[];for(let e of this.textures.values())e.dispose()}spawn=(e,t,n={})=>{let s=new kt({map:this.texture(e),transparent:!0,alphaTest:.05,depthWrite:!1});n.tint!==void 0&&s.color.setHex(n.tint);let r=new Vt(s);r.position.set(t[0],t[1],t[2]),r.userData.aspect=n.aspect??1;let o=typeof n.size=="number"?[n.size,n.size]:n.size??[2,2];r.scale.set(o[0],o[0],1);let a=n.delay??0;r.visible=a<=0,this.holder.add(r);let[l,c,h]=n.v??[0,0,0];this.parts.push({sprite:r,age:0,life:n.life??1,delay:a,vx:l,vy:c,vz:h,gravity:n.gravity??0,drag:n.drag??0,spin:n.spin??0,size:o,flip:n.flip,sway:n.sway})};texture(e){let t=this.textures.get(e);if(t)return t;let{rows:n,palette:s}=yl[e]??yl.dot,r=document.createElement("canvas");r.width=n[0].length,r.height=n.length;let o=r.getContext("2d");return n.forEach((a,l)=>[...a].forEach((c,h)=>{s[c]&&(o.fillStyle=s[c],o.fillRect(h,l,1,1))})),t=new an(r),t.magFilter=He,t.minFilter=He,t.colorSpace=Xe,this.textures.set(e,t),t}};var fr=class{constructor(e,t){this.space=e;this.texture=t}space;texture;live=[];due=0;at=new L;update(e,t){if(t)for(this.due+=e*16;this.due>=1;){this.due--;let n=t[Math.floor(Math.random()*t.length)],s=this.texture();if(!s)break;this.at.set((Math.random()-.5)*2,-11.5,-3.2),n.localToWorld(this.at),this.space.worldToLocal(this.at);let r=new Vt(new kt({map:s,transparent:!0,alphaTest:.05,depthWrite:!1})),o=1+Math.random()*.8;r.scale.set(o,o,1),r.position.copy(this.at),this.space.add(r),this.live.push({sprite:r,age:0,life:.25+Math.random()*.2,vy:-10-Math.random()*6})}else this.due=0;for(let n of this.live){n.age+=e,n.sprite.position.y+=n.vy*e;let s=1-n.age/n.life;n.sprite.scale.setScalar(Math.max(.2,n.sprite.scale.x*(1-e*2))),n.sprite.material.opacity=Math.min(1,s*2)}for(let n of this.live.filter(s=>s.age>=s.life))this.space.remove(n.sprite),n.sprite.material.dispose();this.live=this.live.filter(n=>n.age<n.life)}dispose(){this.update(0,void 0);for(let e of this.live)this.space.remove(e.sprite),e.sprite.material.dispose();this.live=[]}};var on=(i,e)=>Array.from({length:e},(t,n)=>`particle/${i}_${n}`),$a={hearts:{kind:"trail",frames:["particle/heart"],size:3,motion:"rise",life:1.2},sparks:{kind:"trail",frames:["particle/glow"],tint:10479615,size:2.2,motion:"drift",life:.7},snow:{kind:"trail",frames:on("generic",8).reverse(),animate:!0,tint:14873343,size:2.4,motion:"fall",life:1.4},notes:{kind:"trail",frames:["particle/note"],tint:"rainbow",size:3,motion:"rise",life:1.2},flames:{kind:"trail",frames:["particle/flame"],size:2.4,motion:"rise",life:.8},enchant:{kind:"aura",frames:"abcdefghijklmnop".split("").map(i=>`particle/sga_${i}`),tint:15263999,size:2.2,motion:"inward",life:1.4},portal:{kind:"aura",frames:on("generic",8),animate:!0,tint:12611839,size:2.4,motion:"inward",life:1.2},cherry:{kind:"aura",frames:on("cherry",12),size:2.6,motion:"fall",life:2.2},souls:{kind:"aura",frames:on("soul",11),animate:!0,size:3.2,motion:"rise",life:1.6},royal:{kind:"aura",frames:on("glitter",8).reverse(),animate:!0,tint:16766282,size:2.6,motion:"rise",life:1.4},clouds:{kind:"trail",frames:on("generic",8).reverse(),animate:!0,tint:16053492,size:3.4,motion:"drift",life:1.2},stars:{kind:"trail",frames:on("spark",8).reverse(),animate:!0,size:2.4,motion:"drift",life:1},bubbles:{kind:"trail",frames:["particle/bubble"],size:2.2,motion:"rise",life:.9},emerald:{kind:"trail",frames:["particle/glint"],tint:7077754,size:2.4,motion:"rise",life:1},soulfire:{kind:"trail",frames:["particle/soul_fire_flame"],size:2.4,motion:"rise",life:.8},glow:{kind:"aura",frames:["particle/glow"],tint:8257496,size:2.2,motion:"rise",life:1.6},magic:{kind:"aura",frames:["particle/enchanted_hit"],size:2.4,motion:"rise",life:1.2},amber:{kind:"aura",frames:["particle/glow"],tint:16756782,size:2.2,motion:"rise",life:1.4},sculk:{kind:"aura",frames:on("sculk_soul",10),animate:!0,size:3.2,motion:"rise",life:1.6},crits:{kind:"trail",frames:["particle/critical_hit"],tint:13162216,size:2.2,motion:"drift",life:.6},witch:{kind:"trail",frames:on("spell",8).reverse(),animate:!0,tint:10571232,size:2.4,motion:"rise",life:1},ink:{kind:"trail",frames:on("generic",8).reverse(),animate:!0,tint:2368556,size:3,motion:"drift",life:1},ash:{kind:"trail",frames:["particle/generic_0"],tint:14211288,size:1.6,motion:"fall",life:1.6},spores:{kind:"aura",frames:["particle/drip_fall"],tint:5406778,size:1.8,motion:"fall",life:2},nautilus:{kind:"aura",frames:["particle/nautilus"],size:2.4,motion:"inward",life:1.2},tears:{kind:"aura",frames:["particle/drip_hang"],tint:6950864,size:2.2,motion:"fall",life:1.4},fireflies:{kind:"aura",frames:["particle/firefly"],size:2,motion:"rise",life:2}},Kp={allay:["entity/allay/allay"],vex:["entity/illager/vex"],bat:["entity/bat/bat","entity/bat"],parrot:["entity/parrot/parrot_red_blue"],bee:["entity/bee/bee"],blaze:["entity/blaze/blaze","entity/blaze"],phantom:["entity/phantom/phantom","entity/phantom"],axolotl:["entity/axolotl/axolotl_lucy"],frog:["entity/frog/frog_temperate","entity/frog/temperate_frog"],fox:["entity/fox/fox"]},Qp={allay:.6,vex:.6,bat:.45,parrot:.55,bee:.5,blaze:.3,phantom:.5,axolotl:.55,frog:.6,fox:.5},em={snow:["particle/generic_7","particle/generic_5","particle/generic_4"],portal:["particle/generic_7","particle/generic_5","particle/generic_6"],souls:["particle/soul_8","particle/soul_9","particle/soul_8"],royal:["particle/glitter_7","particle/glitter_5","particle/glitter_6"],clouds:["particle/generic_7","particle/generic_6","particle/generic_5"],stars:["particle/spark_7","particle/spark_5","particle/spark_6"],sculk:["particle/sculk_soul_8","particle/sculk_soul_9","particle/sculk_soul_8"],witch:["particle/spell_7","particle/spell_5","particle/spell_6"],ink:["particle/generic_7","particle/generic_6","particle/generic_5"]},pr=class{constructor(e,t,n="img/clothing/",s="img/pets/"){this.viewer=e;this.pictures=t;this.clothing=n;this.pets=s;this.kills=new dr(e.playerWrapper),this.rocket=new fr(e.playerWrapper,()=>this.texture("particle/flame"));let r=o=>{this.update(Math.min(.1,(o-this.last)/1e3),o/1e3),this.last=o,this.frame=requestAnimationFrame(r)};this.frame=requestAnimationFrame(r)}viewer;pictures;clothing;pets;textures=new Map;particles=[];pet;petId="";wings=[];trail;aura;spawnTrail=0;spawnAura=0;last=performance.now();frame=0;clothes=[];dressed="";wearing={};rocket;ourPet;kills;get ready(){return Object.keys(this.pictures).length>0}texture(e){let t=this.pictures[e];if(!t)return;let n=this.textures.get(e);if(!n){let s=new Image;n=new ft(s);let r=n;s.onload=()=>{r.needsUpdate=!0},s.src=t,n.magFilter=He,n.minFilter=He,n.colorSpace=Xe,this.textures.set(e,n)}return n}show(e){this.kills.set(e.kill),this.wearing={hat:e.hat||void 0,top:e.top||void 0,shoes:e.shoes||void 0,hands:e.hands||void 0},this.dress(),this.trail=e.trail?$a[e.trail]:void 0,this.aura=e.aura?$a[e.aura]:void 0,!((e.pet??"")===this.petId&&(this.pet||!e.pet))&&(this.pet&&this.viewer.playerWrapper.remove(this.pet),this.pet=void 0,this.wings=[],this.petId=e.pet??"",e.pet&&(this.pet=this.petModel(e.pet)??this.eggSprite(e.pet),this.pet&&this.viewer.playerWrapper.add(this.pet)))}petModel(e){let t=ul[e],n=hl[e]??t,s=t?this.ourTexture(`${this.pets}${e}_0.png`):this.texture(Kp[e]?.find(h=>this.pictures[h])??"");if(this.ourPet=void 0,!n||!s)return;let r=t?new Ht({map:s,transparent:!0,alphaTest:.02,side:Dt}):new Ht({map:s,transparent:!0,alphaTest:.1,side:vt});t&&(this.ourPet={id:e,material:r,frame:0});let o=0,a=h=>{let d=new Je,[f,m,g,_,p,u]=h.pose;if(d.position.set(f,m,g),d.rotation.set(_,p,u,"ZYX"),h.quads.length){let S=[],y=[],R=[];for(let T of h.quads){let k=S.length/3;for(let v=0;v<4;v++)S.push(T[v*5],T[v*5+1],T[v*5+2]),y.push(T[v*5+3],1-T[v*5+4]);R.push(k,k+1,k+2,k,k+2,k+3)}let w=new Ot;w.setAttribute("position",new mt(S,3)),w.setAttribute("uv",new mt(y,2)),w.setIndex(R),w.computeVertexNormals();let P=new Ge(w,r);P.renderOrder=o++,d.add(P)}if(/^(left|right)_wing(_base)?$/.test(h.name)){let S=e==="bee"||e==="bat"||e==="parrot"||e==="phantom"?"z":"y";this.wings.push({part:d,base:S==="z"?u:p,side:h.name.startsWith("left")?1:-1,axis:S,speed:e==="phantom"?4:S==="z"?18:9})}for(let S of h.children)d.add(a(S));return d},l=a(n),c=new Je;return l.scale.set(1,-1,-1),c.add(l),c.scale.setScalar(Qp[e]??(t?.7:.6)),c}dress(){let e=this.viewer.playerObject.skin,t=e.modelType==="slim",n=`${this.wearing.hat??""}|${this.wearing.top??""}|${this.wearing.shoes??""}|${this.wearing.hands??""}|${t}`;if(n===this.dressed)return;this.dressed=n;for(let r of this.clothes)r.holder.parent?.remove(r.holder),r.mesh.geometry.dispose(),r.mesh.material.dispose();this.clothes=[];let s={head:[e.head,0],body:[e.body,6],right_arm:[e.rightArm,0],left_arm:[e.leftArm,0],right_leg:[e.rightLeg,0],left_leg:[e.leftLeg,0]};for(let r of[this.wearing.hat,this.wearing.top,this.wearing.shoes,this.wearing.hands]){let o=r?xl(r):void 0;if(!o)continue;let a=new Ht({map:this.clothingTexture(o.id),transparent:!0,alphaTest:.1,side:vt}),l=gl(o),c=new Map;o.boxes.forEach((h,d)=>c.set(h.bone,[...c.get(h.bone)??[],[t?ml(h):h,l[d]]]));for(let[h,d]of c){let f=[],m=[],g=[];for(let[S,y]of d)for(let R of _l(S,y)){let w=f.length/3;for(let P of R.corners)f.push(P[0],P[1],P[2]),m.push(P[3],1-P[4]);g.push(w,w+1,w+2,w,w+2,w+3)}let _=new Ot;_.setAttribute("position",new mt(f,3)),_.setAttribute("uv",new mt(m,2)),_.setIndex(g),_.computeVertexNormals();let p=new Ge(_,a),u=new Je;u.scale.set(1,-1,-1),u.position.y=s[h][1],u.add(p),s[h][0].add(u),this.clothes.push({mesh:p,holder:u})}}}clothingTexture(e){return this.ourTexture(`${this.clothing}${e}.png`)}ourTexture(e){let t=`ours:${e}`,n=this.textures.get(t);if(!n){let s=new Image;n=new ft(s);let r=n;s.onload=()=>{r.needsUpdate=!0},s.src=e,n.magFilter=He,n.minFilter=He,n.colorSpace=Xe,this.textures.set(t,n)}return n}eggSprite(e){let t=this.texture(`item/${e}_spawn_egg`);if(!t)return;let n=new Vt(new kt({map:t,transparent:!0,alphaTest:.1}));return n.scale.set(8,8,1),n}emit(e){let t=e.animate?e.frames[0]:e.frames[Math.floor(Math.random()*e.frames.length)],n=this.texture(t);if(!n)return;let s=new kt({map:n,transparent:!0,alphaTest:.05,depthWrite:!1}),r=e.tint==="rainbow"?[16734810,16760906,8257386,4905215,11823871][Math.floor(Math.random()*5)]:e.tint;r!==void 0&&s.color.setHex(r);let o=new Vt(s);o.scale.set(e.size,e.size,1);let a=0,l=0,c=0;if(e.kind==="trail")o.position.set((Math.random()-.5)*8,-15+Math.random()*4,-4-Math.random()*4),c=-6;else{let h=Math.random()*Math.PI*2,d=12+Math.random()*3;o.position.set(Math.cos(h)*d,-14+Math.random()*28,Math.sin(h)*d)}e.motion==="rise"&&(l=6+Math.random()*3),e.motion==="fall"&&(l=-4-Math.random()*2),e.motion==="drift"&&(a=(Math.random()-.5)*10,l=3),e.motion==="inward"&&(a=-o.position.x*.8,c=-o.position.z*.8,l=(6-o.position.y)*.4),this.viewer.playerWrapper.add(o),this.particles.push({sprite:o,effect:e,age:0,vx:a,vy:l,vz:c,frame:0})}update(e,t){this.dress(),this.kills.update(e);let n=this.viewer.playerObject.skin;if(this.rocket.update(e,this.wearing.shoes==="rocketboots"?[n.rightLeg,n.leftLeg]:void 0),this.pet){let s=this.pet instanceof Vt?0:this.pet.scale.x;this.pet.position.set(10,6+24*s+Math.sin(t*2.2)*1.2,-3);for(let a of this.wings)a.part.rotation[a.axis]=a.base+a.side*Math.sin(t*a.speed)*.35;let r=this.ourPet,o=r?Math.floor(t)%(dl[r.id]??1):0;r&&o!==r.frame&&(r.frame=o,r.material.map=this.ourTexture(`${this.pets}${r.id}_${o}.png`),r.material.needsUpdate=!0)}this.trail&&(this.spawnTrail+=e)>.09&&(this.spawnTrail=0,this.emit(this.trail)),this.aura&&(this.spawnAura+=e)>.12&&(this.spawnAura=0,this.emit(this.aura));for(let s of this.particles){s.age+=e,s.sprite.position.x+=s.vx*e,s.sprite.position.y+=s.vy*e,s.sprite.position.z+=s.vz*e;let r=1-s.age/s.effect.life;if(s.sprite.material.opacity=Math.min(1,r*3),s.effect.animate){let o=Math.min(s.effect.frames.length-1,Math.floor(s.age/s.effect.life*s.effect.frames.length));if(o!==s.frame){s.frame=o;let a=this.texture(s.effect.frames[o]);a&&(s.sprite.material.map=a)}}}for(let s of this.particles.filter(r=>r.age>=r.effect.life))this.viewer.playerWrapper.remove(s.sprite),s.sprite.material.dispose();this.particles=this.particles.filter(s=>s.age<s.effect.life)}dispose(){cancelAnimationFrame(this.frame),this.show({});for(let e of this.particles)this.viewer.playerWrapper.remove(e.sprite);this.particles=[],this.kills.dispose(),this.rocket.dispose();for(let e of this.textures.values())e.dispose()}};function Ml(i,e){let t=i[`item/${e}_spawn_egg`];if(t)return{srcs:[t]};let n=$a[e];if(!n)return;let s=n.frames.length,r=(em[e]??[n.frames[0],n.frames[Math.floor(s/3)],n.frames[Math.floor(2*s/3)]]).map(a=>i[a]).filter(a=>!!a);if(!r.length)return;let o=typeof n.tint=="number"?`#${n.tint.toString(16).padStart(6,"0")}`:n.tint==="rainbow"?"#7dff6a":void 0;return{srcs:r,tint:o}}function tm(i){return new Promise((e,t)=>{let n=new Image;n.onload=()=>e(n),n.onerror=t,n.src=i})}function nm(i){let e=document.createElement("canvas");e.width=i.naturalWidth,e.height=i.naturalHeight;let t=e.getContext("2d");t.drawImage(i,0,0);let{data:n}=t.getImageData(0,0,e.width,e.height),s=e.width,r=e.height,o=-1,a=-1;for(let l=0;l<e.height;l++)for(let c=0;c<e.width;c++)n[(l*e.width+c)*4+3]<16||(s=Math.min(s,c),r=Math.min(r,l),o=Math.max(o,c),a=Math.max(a,l));return o<0?[0,0,e.width,e.height]:[s,r,o-s+1,a-r+1]}function bl(i,e){let t=document.createElement("canvas");t.className="game-icon",t.width=t.height=64;let n=t.getContext("2d");n.imageSmoothingEnabled=!1;let s=i.length===1?[[0,0,64]]:[[18,16,34],[2,4,20],[42,40,18]];return Promise.all(i.map(r=>tm(r))).then(r=>{r.forEach((o,a)=>{let[l,c,h]=s[a]??s[0],[d,f,m,g]=nm(o),_=Math.max(1,Math.floor(h/Math.max(m,g))),p=m*_,u=g*_,S=document.createElement("canvas");S.width=p,S.height=u;let y=S.getContext("2d");y.imageSmoothingEnabled=!1,y.drawImage(o,d,f,m,g,0,0,p,u),e&&(y.globalCompositeOperation="multiply",y.fillStyle=e,y.fillRect(0,0,p,u),y.globalCompositeOperation="destination-in",y.drawImage(o,d,f,m,g,0,0,p,u)),n.drawImage(S,l+Math.floor((h-p)/2),c+Math.floor((h-u)/2))})}).catch(()=>{}),t}window.SlashPreview={SkinViewer:hr,IdleAnimation:lr,CosmeticPreview:pr,cosmeticIcon:Ml,gameIcon:bl};})();
/*! Bundled license information:

three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2023 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)
*/
