import express from 'express';
import crypto from 'node:crypto';
import {configureHttp} from './http.mjs';
import {createEngine} from './engine.mjs';

export function createDatabaseApp({repository,allowedOrigins=[],trustProxy=false}){
  const app=express();
  configureHttp(app,{allowedOrigins,trustProxy});
  app.use(express.json({limit:'1mb'}));
  // Keep the original /api prefix: createEngine registers full API paths.
  app.use(async(req,res,next)=>{
    if(!req.path.startsWith('/api/'))return next();
    const sendJson=res.json;
    try{
      const result=await repository.run(async(data,sessions)=>{
        let dirty=false;
        const router=express.Router();
        router.locals=app.locals;
        createEngine({app:router,data,sessions,save:()=>{dirty=true;},
          randomId:()=>crypto.randomUUID(),randomToken:()=>crypto.randomBytes(24).toString('hex'),
          fingerprint:value=>crypto.createHash('sha256').update(value).digest('hex')});
        return new Promise((resolve,reject)=>{
          // Existing routes return JSON synchronously. Delay the actual response
          // until PostgreSQL commits; never acknowledge an uncommitted order.
          res.json=body=>{resolve({status:res.statusCode,body:structuredClone(body),dirty});return res;};
          router(req,res,error=>error?reject(error):resolve({status:404,body:{error:'ไม่พบ API'},dirty:false}));
        });
      });
      res.json=sendJson;
      res.status(result.status).json(result.body);
    }catch(error){
      res.json=sendJson;
      console.error('Database request failed:',error.code||error.name);
      res.status(503).json({error:'ฐานข้อมูลไม่พร้อมใช้งาน กรุณาลองอีกครั้ง'});
    }
  });
  return {app};
}
