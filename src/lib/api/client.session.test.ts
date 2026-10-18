import {afterEach,describe,expect,it,vi} from "vitest";
import {apiFetch,signInWithPassword} from "./client";
import {endSession,getAccessToken,getCaller,loadCaller,sessionLoadFailure,startSession,
  subscribeToSession} from "./session";

afterEach(()=>{vi.unstubAllGlobals();endSession();});

describe("session recovery boundary",()=>{
  it("keeps a confirmed caller through refresh without an unresolved identity flash",async()=>{
    vi.useFakeTimers();
    const entries=new Map<string,string>();
    const storage={getItem:(key:string)=>entries.get(key)??null,
      setItem:(key:string,value:string)=>{entries.set(key,value);},
      removeItem:(key:string)=>{entries.delete(key);}};
    vi.stubGlobal("window",{localStorage:storage,sessionStorage:storage});
    const jwt=(seconds:number)=>{
      const b64=(value:unknown)=>btoa(JSON.stringify(value)).replace(/\+/g,"-")
        .replace(/\//g,"_").replace(/=+$/g,"");
      return `${b64({alg:"HS256"})}.${b64({exp:Math.floor(Date.now()/1000)+seconds})}.sig`;
    };
    const user={id:"u1",tenantId:"t1",name:"Operator",role:"owner",
      level:null,mustChangePassword:false};
    const original=jwt(900),rotated=jwt(1800);
    const fetchMock=vi.fn().mockImplementation((url:string)=>{
      if(url.endsWith("/auth/refresh"))return Promise.resolve(new Response(
        JSON.stringify({accessToken:rotated}),{status:200}));
      if(url.endsWith("/api/me"))return Promise.resolve(new Response(
        JSON.stringify(user),{status:200}));
      return Promise.resolve(new Response(JSON.stringify({ok:true}),{status:200}));
    });
    vi.stubGlobal("fetch",fetchMock);
    startSession({accessToken:original});
    await loadCaller();
    vi.setSystemTime(Date.now()+850_000);
    const observed:(string|null)[]=[];
    const unsubscribe=subscribeToSession(()=>observed.push(getCaller()?.id??null));
    try{
      await apiFetch("/api/anything");
      expect(getCaller()?.id).toBe("u1");
      expect(observed).toEqual(["u1"]);
      expect(fetchMock.mock.calls.map(call=>call[0])).toEqual([
        "/api/me","/auth/refresh",
        "/api/me","/api/anything"]);
    }finally{unsubscribe();vi.useRealTimers();}
  });
  it("classifies a refused session as session-ended, not validation",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(
      JSON.stringify({error:"Sign in again"}),{status:401,
        headers:{"content-type":"application/json"}})));
    await expect(apiFetch("/api/me")).rejects.toMatchObject({
      appError:{kind:"session",code:"SESSION_ENDED"}});
  });
  it("keeps network failure as connectivity without an auth conclusion",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("offline")));
    await expect(apiFetch("/api/me")).rejects.toMatchObject({
      appError:{kind:"connectivity"}});
  });
  it("keeps a failed identity read retryable without discarding the token",async()=>{
    startSession({accessToken:"synthetic-token"});
    vi.stubGlobal("fetch",vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify({id:"u1",tenantId:"t1",
        name:"Operator",role:"owner",level:null,mustChangePassword:false}),
      {status:200})));
    expect(await loadCaller()).toBeNull();
    expect(sessionLoadFailure()).toBe("connectivity");
    expect(getAccessToken()).toBe("synthetic-token");
    expect((await loadCaller())?.id).toBe("u1");
    expect(sessionLoadFailure()).toBeNull();
  });
  it("does not mount a caller from an incomplete identity response",async()=>{
    startSession({accessToken:"synthetic-token"});
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(
      JSON.stringify({id:"u1",role:"owner"}),{status:200})));
    expect(await loadCaller()).toBeNull();
    expect(sessionLoadFailure()).toBe("unavailable");
    expect(getAccessToken()).toBe("synthetic-token");
  });
  it("makes a malformed sign-in refusal retryable instead of crashing JSON parsing",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("unavailable",{status:503})));
    await expect(signInWithPassword("staff@invalid.example","test password"))
      .resolves.toEqual({ok:false,message:"Could not sign in just now"});
  });
  it("does not claim sign-in success when identity confirmation cannot load",async()=>{
    const fetchMock=vi.fn().mockImplementation((url:string)=>url.endsWith("/auth/password")?
      Promise.resolve(new Response(JSON.stringify({accessToken:"token"}),{status:200})):
      Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch",fetchMock);
    await expect(signInWithPassword("staff@invalid.example","test password"))
      .resolves.toMatchObject({ok:false});
  });
  it("does not let a previous identity read replace a newly signed-in caller",async()=>{
    let finishOld:(response:Response)=>void=()=>{};
    const oldRead=new Promise<Response>(resolve=>{finishOld=resolve;});
    const old={id:"old",tenantId:"t1",name:"Previous",role:"owner",level:null,
      mustChangePassword:false};
    const next={...old,id:"next",name:"Current"};
    vi.stubGlobal("fetch",vi.fn().mockImplementation((url:string,init?:RequestInit)=>{
      if(url.endsWith("/auth/password"))return Promise.resolve(new Response(
        JSON.stringify({accessToken:"new-token"}),{status:200}));
      if(url.endsWith("/api/me"))return init?.headers &&
        (init.headers as Record<string,string>).Authorization==="Bearer old-token"?
          oldRead:Promise.resolve(new Response(JSON.stringify(next),{status:200}));
      throw Error(`Unexpected request: ${url}`);
    }));
    startSession({accessToken:"old-token"});
    const first=loadCaller();
    expect(await signInWithPassword("next@test.invalid","password"))
      .toEqual({ok:true});
    finishOld(new Response(JSON.stringify(old),{status:200}));
    await first;
    expect(getCaller()).toEqual(next);
    expect(getAccessToken()).toBe("new-token");
  });
  it("does not let an old request's late 401 end a newer session",async()=>{
    let finishOld:(response:Response)=>void=()=>{};
    const oldRequest=new Promise<Response>(resolve=>{finishOld=resolve;});
    const next={id:"next",tenantId:"t1",name:"Current",role:"owner",level:null,
      mustChangePassword:false};
    vi.stubGlobal("fetch",vi.fn().mockImplementation((url:string,init?:RequestInit)=>{
      if(url.endsWith("/auth/password"))return Promise.resolve(new Response(
        JSON.stringify({accessToken:"new-token"}),{status:200}));
      if(url.endsWith("/api/me"))return Promise.resolve(new Response(
        JSON.stringify(next),{status:200}));
      if(url.endsWith("/api/anything"))return init?.headers &&
        (init.headers as Record<string,string>).Authorization==="Bearer old-token"?
          oldRequest:Promise.resolve(new Response(JSON.stringify({ok:true}),{status:200}));
      throw Error(`Unexpected request: ${url}`);
    }));
    startSession({accessToken:"old-token"});
    const first=apiFetch("/api/anything");
    expect(await signInWithPassword("next@test.invalid","password"))
      .toEqual({ok:true});
    finishOld(new Response(JSON.stringify({error:"Session ended"}),{status:401}));
    await expect(first).rejects.toMatchObject({appError:{kind:"session",
      code:"SESSION_CHANGED"}});
    expect(getCaller()).toEqual(next);
    expect(getAccessToken()).toBe("new-token");
  });
  it("finishes a previous refresh cookie exchange before password sign-in",async()=>{
    const entries=new Map<string,string>();
    vi.stubGlobal("window",{localStorage:{getItem:(key:string)=>entries.get(key)??null,
      setItem:(key:string,value:string)=>{entries.set(key,value);},
      removeItem:(key:string)=>{entries.delete(key);}},
    sessionStorage:{removeItem:()=>{},setItem:()=>{}}});
    const stale=`header.${btoa(JSON.stringify({exp:1}))}.signature`;
    let finishRefresh:(response:Response)=>void=()=>{};
    const oldRefresh=new Promise<Response>(resolve=>{finishRefresh=resolve;});
    const calls:string[]=[];
    const identity={id:"current",tenantId:"t1",name:"Current",role:"owner",
      level:null,mustChangePassword:false};
    vi.stubGlobal("fetch",vi.fn().mockImplementation((url:string)=>{
      calls.push(url);
      if(url.endsWith("/auth/refresh"))return oldRefresh;
      if(url.endsWith("/auth/password"))return Promise.resolve(new Response(
        JSON.stringify({accessToken:"new-token"}),{status:200}));
      if(url.endsWith("/api/me"))return Promise.resolve(new Response(
        JSON.stringify(identity),{status:200}));
      return Promise.resolve(new Response(JSON.stringify({ok:true}),{status:200}));
    }));
    startSession({accessToken:stale});
    const previous=apiFetch("/api/anything");
    const signing=signInWithPassword("current@test.invalid","password");
    expect(calls).toEqual(["/auth/refresh"]);
    finishRefresh(new Response(JSON.stringify({accessToken:"refreshed-old"}),
      {status:200}));
    await previous;
    expect(await signing).toEqual({ok:true});
    expect(calls.indexOf("/auth/password"))
      .toBeGreaterThan(calls.indexOf("/api/me"));
    expect(getCaller()).toEqual(identity);
  });
});
