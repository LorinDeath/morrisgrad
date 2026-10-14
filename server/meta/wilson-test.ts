import { wilsonLB } from "./rating";
let p=0,f=0; const ok=(c:boolean,m:string)=>{c?p++:f++;console.log((c?"PASS ":"FAIL ")+m);};
ok(wilsonLB(1,0,0) < wilsonLB(18,2,0), "1-0 below 18-2");
ok(wilsonLB(1,0,0) < wilsonLB(7,3,0), "1-0 below 7-3");
ok(wilsonLB(10,0,0) > wilsonLB(10,5,0), "same wins, fewer losses higher");
ok(wilsonLB(0,0,0) === 0, "no duels = 0");
ok(wilsonLB(50,50,0) > wilsonLB(1,1,0), "50% with many duels above 50% with 2");
console.log(`${p} passed, ${f} failed`);
