import express from 'express';
import crypto from 'node:crypto';
import {configureHttp} from './http.mjs';
import {createEngine} from './engine.mjs';

export function createApp({data,save,allowedOrigins=[],trustProxy=false}={}){
 const app=express();
 configureHttp(app,{allowedOrigins,trustProxy});
 app.use(express.json({limit:'1mb'}));
 return createEngine({app,data,save,randomId:()=>crypto.randomUUID(),randomToken:()=>crypto.randomBytes(24).toString('hex'),fingerprint:value=>crypto.createHash('sha256').update(value).digest('hex')});
}
