import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
const projectId='demo-prd0062-u-rules',headers={Authorization:'Bearer owner','Content-Type':'application/json'};
const settings='http://localhost:9000/.settings/rules.json?ns='+projectId;
const rulesPath=process.argv[2]??'output/prd0062-current-base-candidate.json';
const rulesText=await fs.readFile(rulesPath,'utf8');
const mode=process.argv[3]??'class';
const attempt=Date.now().toString();
const beforeRulesPath='output/prd0062-'+mode+'-native-before-'+attempt+'.rules.json';
const beforeDataPath='output/prd0062-'+mode+'-native-before-'+attempt+'.data.json';
const sha=x=>createHash('sha256').update(x).digest('hex');
const response=await fetch(settings,{headers});assert.equal(response.status,200);const previousRules=await response.text();
await fs.writeFile(beforeRulesPath,previousRules);
const paths=new Set(),saved=new Map(),results=[];let env;
const caseResult=async(name,fn,allowed)=>{let actual=true;try{await fn();}catch(e){if(!/permission.denied/i.test(String(e)))throw e;actual=false;}results.push({name,expected:allowed,allowed:actual,passed:actual===allowed});assert.equal(actual,allowed,name);};
const admin=async fn=>{let result;await env.withSecurityRulesDisabled(async c=>{result=await fn(c.database());});return result;};
const preserve=async p=>{if(saved.has(p)||[...saved.keys()].some(parent=>p.startsWith(parent+'/')))return;paths.add(p);saved.set(p,(await admin(async db=>(await db.ref(p).once('value')).val()))??null);await fs.writeFile(beforeDataPath,JSON.stringify(Object.fromEntries(saved),null,2));};
const seed=async(p,v)=>{await preserve(p);await admin(db=>db.ref(p).set(v));};
const uid='rules-native-owner',classId='rules-native-class',copyId='rules-native-copy',material='rules-native-material',placementId='rules-native-placement';
const context='class-'+classId+'-copy-'+copyId+'-material-'+material;
const copyPath='class_book_authority/copies/'+classId+'/'+copyId,currentPath='class_book_authority/placements/current/'+context;
const versionPath=n=>'class_book_authority/placements/versions/'+context+'/'+n;
const lockPath='classes/'+classId+'/book_locks/'+placementId;
const copy={schemaVersion:1,copyId,classId,classCourseId:'class-course',sourceCourseId:'source-course',sourceCourseMaterialId:material,ownerId:uid,status:'active',copyRevision:1,createdAt:'2026-10-04T00:00:00.000Z',createdBy:uid,updatedAt:'2026-10-04T00:00:00.000Z',updatedBy:uid};
const placement={schemaVersion:1,classPlacementId:placementId,classId,copyId,classCourseId:'class-course',sourceCourseId:'source-course',courseMaterialId:material,sourceCourseMaterialId:material,ownerId:uid,sourcePlacementRevision:1,placementRevision:1,status:'active',pins:{bookId:'book-native',publicationId:'publication-native',publicationRevision:1,unitStableKey:'unit-a',unitVersionId:'uv-a',manifestVersionId:'manifest-native',sourceVersionId:'source-a',bindingRevision:'binding-native'},selection:{kind:'placements',nodeKeys:[],placementIds:['activity-a','activity-b']},activities:[{placementId:'activity-a',activityId:'a',activityVersionId:'av-a',unitStableKey:'unit-a',unitVersionId:'uv-a',sourceVersionId:'source-a',pageGroupId:'page-a',physicalPageNumber:1,order:0,title:'Activity A'},{placementId:'activity-b',activityId:'b',activityVersionId:'av-b',unitStableKey:'unit-b',unitVersionId:'uv-b',sourceVersionId:'source-b',pageGroupId:'page-b',physicalPageNumber:2,order:1,title:'Activity B'}],sourceFingerprint:'f'.repeat(64),title:'Two units',createdAt:'2026-10-04T00:00:00.000Z',createdBy:uid,updatedAt:'2026-10-04T00:00:00.000Z',updatedBy:uid};
const lock={classId,classPlacementId:placementId,state:'locked',revision:1,changedBy:uid,changedAt:'2026-10-04T00:00:00.000Z',operationId:'lock-native'};
const tuple=(kind,op,outcome,expected=0)=>{const next=kind==='copy'?outcome.copyRevision:kind==='lock'?outcome.revision:outcome.placementRevision;
const claims={classBookAuthority103:true,classBookOperation:kind,actorUid:uid,classId,operationId:op,inputFingerprint:'a'.repeat(64),payloadFingerprint:'b'.repeat(64),expectedRevision:expected,nextRevision:next,...(kind==='copy'?{copyId}:kind==='lock'?{classPlacementId:placementId}:{copyId,classPlacementId:placementId,contextId:context,courseMaterialId:material})};
const receipt={schemaVersion:1,operationId:op,kind,actorUid:uid,classId,inputFingerprint:claims.inputFingerprint,payloadFingerprint:claims.payloadFingerprint,outcome};
const opPath='class_book_authority/operations/'+op;const patch={[opPath]:receipt};
if(kind==='copy')patch[copyPath]=outcome;else if(kind==='lock')patch[lockPath]=outcome;else{patch[currentPath]=outcome;patch[versionPath(next)]=outcome;}
return {claims,receipt,opPath,patch};};
try{
env=await initializeTestEnvironment({projectId,database:{host:'localhost',port:9000,rules:rulesText}});
if(mode==='draft'){
const book='rules-native-draft',bookPath='material_catalog/books/'+book,units='book_assembly/books/'+book+'/units';
await seed(bookPath,{bookId:book,ownerId:uid,bookMode:'pdf'});await seed(units,{unit1:{current:{candidateId:'candidate'}}});
const claims={book_assembly_draft_discovery_service:true,book_assembly_draft_discovery_bookId:book,book_assembly_draft_discovery_ownerId:uid};
const db=extra=>env.authenticatedContext('draft-service',{...claims,...extra}).database();
await caseResult('qualified discovery',()=>db().ref(units).once('value'),true);
for(const extra of [{book_assembly_draft_discovery_bookId:'wrong'},{book_assembly_draft_discovery_ownerId:'wrong'},{book_assembly_draft_discovery_service:false}])await caseResult('wrong discovery capability '+JSON.stringify(extra),()=>db(extra).ref(units).once('value'),false);
await caseResult('parent write denied',()=>db().ref(units).set({forged:true}),false);
await caseResult('ancestor write denied',()=>db().ref('book_assembly/books/'+book).set({units:{forged:true}}),false);
await caseResult('parent ancestor read denied',()=>db().ref('book_assembly/books/'+book).once('value'),false);
await seed(bookPath,{bookId:book,ownerId:uid,bookMode:'activity'});
await caseResult('nonPDF discovery denied',()=>db().ref(units).once('value'),false);
}else if(mode==='course'){
const courseId='rules-native-course',moduleId='rules-native-module',courseMaterialId='rules-native-course-material',requestId='rules-native-request',studentId='rules-native-student';
await seed('users/'+uid,{role:'teacher',status:'active'});await seed('courses/'+courseId,{ownerId:uid,status:'active'});
const requestPath='course_requests/'+requestId,legacyId='course-request-'+requestId,legacyPath='course_enrollments/'+legacyId,authorityPath='course_book_authority/enrollments/'+courseId+'/'+studentId;
const time=Date.now(),request={id:requestId,studentId,studentName:'Native student',courseId,courseName:'Native course',teacherId:uid,type:'join',status:'pending',requestedAt:time-1000,expiresAt:time+60000};
await seed(requestPath,request);await seed(legacyPath,null);await seed(authorityPath,null);
const joinOp='rules-native-course-join',joinReceiptPath='course_book_authority/operations/'+joinOp;await seed(joinReceiptPath,null);
const joinClaims={courseBookAuthority102:true,operation:'enrollment-request-transition',actorUid:uid,courseId,studentId,legacyEnrollmentId:legacyId,requestId,requestType:'join',expectedLegacyRevision:0,expectedAuthorityRevision:0,operationId:joinOp};
const joinPatch={[requestPath]:{...request,status:'approved',processedBy:uid,processedAt:time},[legacyPath]:{id:legacyId,courseId,studentId,enrollmentType:'individual',enrolledAt:time,expiresAt:0,status:'active',revision:1,operationId:joinOp},[authorityPath]:{legacyEnrollmentId:legacyId,courseId,studentId,status:'active',revision:1,operationId:joinOp,updatedAt:new Date(time).toISOString()},[joinReceiptPath]:{operation:'enrollment-request-transition',operationId:joinOp,requestId,actorUid:uid,courseId,studentId,requestType:'join',legacyEnrollmentId:legacyId,revision:1,fingerprint:'f'.repeat(64),createdAt:new Date(time).toISOString()}};
const joinDb=env.authenticatedContext('course-service',joinClaims).database();
for(const omitted of Object.keys(joinPatch)){const broken={...joinPatch};delete broken[omitted];await caseResult('Course join missing '+omitted,()=>joinDb.ref().update(broken),false);}
await caseResult('preserved Course join four-leg tuple',()=>joinDb.ref().update(joinPatch),true);
const materialPath='course_materials/'+courseMaterialId;await seed(materialPath,{id:courseMaterialId,unrelatedShell:'preserved'});
const outcome={courseMaterialId,courseId,moduleId,ownerId:uid,displayTitle:'Native Course Book',selection:{kind:'placements',placementIds:['p-a']},placementRevision:1,completionAggregationPolicy:'all-activities',status:'active',pins:{bookId:'native-book',publicationId:'native-publication',publicationRevision:1,manifestVersionId:'native-manifest',bindingRevision:1,selectedActivities:[{placementId:'p-a',nodeKey:'node-a',unitStableKey:'unit-a',unitVersionId:'uv-a',activityId:'activity-a',activityVersionId:'av-a',sourceVersionIds:['source-a']}]}};
for(const action of ['create','revoke']){
const revision=action==='create'?1:2,next=action==='create'?outcome:{...outcome,status:'revoked',placementRevision:2},op='rules-native-course-'+action,opPath='course_book_authority/operations/'+op;
await seed(opPath,null);
const claims={courseBookAuthority102:true,operation:'placement-transition',action,actorUid:uid,courseId,moduleId,courseMaterialId,operationId:op,expectedPlacementRevision:revision-1,nextPlacementRevision:revision,fingerprint:'c'.repeat(64)};
const receipt={operation:'placement-transition',action,actorUid:uid,courseId,moduleId,courseMaterialId,operationId:op,expectedPlacementRevision:revision-1,revision,fingerprint:claims.fingerprint,outcome:next};
const patch={[materialPath+'/bookDeliveryPlacement']:next,[opPath]:receipt};
if(action==='create')Object.assign(patch,{[materialPath+'/id']:courseMaterialId,[materialPath+'/courseId']:courseId,[materialPath+'/moduleId']:moduleId,[materialPath+'/materialId']:'native-book',[materialPath+'/order']:time,[materialPath+'/linkedAt']:time,[materialPath+'/isCopy']:false,[materialPath+'/materialKind']:'book-delivery'});
const db=env.authenticatedContext('course-service',claims).database();
for(const omitted of [materialPath+'/bookDeliveryPlacement',opPath]){const broken={...patch};delete broken[omitted];await caseResult('Course '+action+' missing '+omitted,()=>db.ref().update(broken),false);}
const forged=structuredClone(patch);forged[opPath].outcome=structuredClone(forged[opPath].outcome);forged[opPath].outcome.pins.selectedActivities[0].unitVersionId='forged';await caseResult('Course '+action+' nested mismatch',()=>db.ref().update(forged),false);
if(action==='revoke'){const mutated=structuredClone(patch);mutated[opPath].outcome.pins.publicationId='new';mutated[materialPath+'/bookDeliveryPlacement'].pins.publicationId='new';await caseResult('Course revoke immutable publication',()=>db.ref().update(mutated),false);}
await caseResult('Course '+action+' atomic tuple',()=>db.ref().update(patch),true);
await caseResult('Course '+action+' receipt replay write denied',()=>db.ref().update(patch),false);
await caseResult('Course '+action+' receipt delete denied',()=>db.ref(opPath).remove(),false);
}
}else if(mode==='u'){
const owner='rules-native-u-owner',planId='rules-native-u-plan',reviewId='rules-native-u-review',bookId='rules-native-u-book',sagaId='rules-native-u-saga';
const reviewPath='book_replacement_plans/reviews/'+owner+'/'+planId+'/'+reviewId,tokenPath='book_replacement_plans/tokens/'+owner+'/'+planId+'/'+reviewId,sagaPath='book_replacement_sagas/records/'+owner+'/'+sagaId;
await seed(reviewPath,null);await seed(tokenPath,null);await seed(sagaPath,null);
const hash='a'.repeat(64),review={schemaVersion:1,ownerId:owner,planId,reviewId,bookId,selectionFingerprint:hash,reason:'Selected only',selections:[{contextKey:'native-context',placementId:'native-placement',choice:'adopt-successor'}]};
const planDb=env.authenticatedContext('plan-service',{bis:{s:true,o:owner,dl:Date.now()+60000}}).database();
await caseResult('review hash required',()=>planDb.ref(reviewPath).set({...review,selectionFingerprint:'invalid'}),false);
await caseResult('selection review create',()=>planDb.ref(reviewPath).set(review),true);
const token={schemaVersion:1,ownerId:owner,planId,reviewId,tokenHash:'t',selectionFingerprint:hash};
await caseResult('token fingerprint must match review',()=>planDb.ref(tokenPath).set({...token,selectionFingerprint:'b'.repeat(64)}),false);
await caseResult('token fingerprint paired',()=>planDb.ref(tokenPath).set(token),true);
const saga={schemaVersion:1,ownerId:owner,sagaId,bookId,planId,tokenHash:'t',selectionFingerprint:hash,reason:review.reason,state:'contexts-pending',stateRevision:0,sourceVersionIds:['source-old'],contexts:{'native-context':{contextKey:'native-context',contextKind:'homework',classification:'changed',lifecycle:'active',status:'active',operationId:'native-context-op',state:'pending',stateRevision:0,selections:review.selections}},requestFingerprint:'request',deltaFingerprint:'delta',snapshotFingerprint:'snapshot',adapterFingerprint:'adapter',acceptedAt:'2026-10-04T00:00:00.000Z'};
const sagaDb=env.authenticatedContext('saga-service',{brs:{s:true,o:owner,a:sagaId,dl:Date.now()+60000}}).database();
await caseResult('selected saga create',()=>sagaDb.ref(sagaPath).set(saga),true);
await caseResult('saga fingerprint immutable',()=>sagaDb.ref(sagaPath).set({...saga,stateRevision:1,selectionFingerprint:'b'.repeat(64)}),false);
await caseResult('saga reason immutable',()=>sagaDb.ref(sagaPath).set({...saga,stateRevision:1,reason:'forged'}),false);
await caseResult('pending context cannot complete',()=>sagaDb.ref(sagaPath).set({...saga,state:'completed',stateRevision:1,retiredByteHandoff:{status:'retained',sourceVersionIds:['source-old'],queuedAt:'2026-10-04T00:00:00.000Z'}}),false);
const settled=structuredClone(saga);settled.stateRevision=1;settled.contexts['native-context'].state='retired-revoked';settled.contexts['native-context'].stateRevision=1;
await caseResult('settle exact selected context',()=>sagaDb.ref(sagaPath).set(settled),true);
const changed=structuredClone(settled);changed.stateRevision=2;changed.contexts['native-context'].selections[0].placementId='forged';
await caseResult('selection immutable while settling',()=>sagaDb.ref(sagaPath).set(changed),false);
await caseResult('settled selected contexts complete with retained candidates',()=>sagaDb.ref(sagaPath).set({...settled,state:'completed',stateRevision:2,retiredByteHandoff:{status:'retained',sourceVersionIds:['source-old'],queuedAt:'2026-10-04T00:00:00.000Z'}}),true);
}else{
await seed('users/'+uid,{role:'teacher',status:'active'});await seed('classes/'+classId,{createdBy:uid,status:'active'});
for(const p of [copyPath,currentPath,versionPath(1),versionPath(2),lockPath])await seed(p,null);
for(const [kind,op,outcome,expected]of [['copy','copy-native',copy,0],['place','place-native',placement,0],['sync','sync-native',{...placement,placementRevision:2},1],['lock','lock-native',lock,0]]){
const t=tuple(kind,op,outcome,expected);await seed(t.opPath,null);
const db=env.authenticatedContext(uid,t.claims).database();
for(const omitted of Object.keys(t.patch)){const broken={...t.patch};delete broken[omitted];await caseResult(kind+' missing '+omitted,()=>db.ref().update(broken),false);}
const mismatch=structuredClone(t.patch);mismatch[t.opPath].outcome=structuredClone(mismatch[t.opPath].outcome);mismatch[t.opPath].outcome.title='forged';if(kind==='copy')mismatch[t.opPath].outcome.ownerId='wrong';if(kind==='lock')mismatch[t.opPath].outcome.state='unlocked';
await caseResult(kind+' mismatched outcome',()=>db.ref().update(mismatch),false);
if(kind==='place'){const altered=structuredClone(t.patch);altered[t.opPath].outcome=structuredClone(altered[t.opPath].outcome);altered[t.opPath].outcome.activities[1].unitVersionId='wrong-version';await caseResult('multi-unit nested mismatch',()=>db.ref().update(altered),false);}
await caseResult(kind+' atomic tuple',()=>db.ref().update(t.patch),true);
await caseResult(kind+' replay write denied',()=>db.ref().update(t.patch),false);
await caseResult(kind+' receipt deletion denied',()=>db.ref(t.opPath).remove(),false);
}
const stale=tuple('sync','sync-stale',{...placement,placementRevision:2},1);await seed(stale.opPath,null);
await caseResult('stale current CAS',()=>env.authenticatedContext(uid,stale.claims).database().ref().update(stale.patch),false);
}
}finally{
try {if(saved.size){env??=await initializeTestEnvironment({projectId,database:{host:'localhost',port:9000}});await admin(db=>db.ref().update(Object.fromEntries(saved)));for(const [path,value]of saved)assert.deepEqual((await admin(async db=>(await db.ref(path).once('value')).val()))??null,value,'restore owned data '+path);}}
finally {await env?.cleanup();const restored=await fetch(settings,{method:'PUT',headers,body:previousRules});assert.equal(restored.status,200);}
const after=await(await fetch(settings,{headers})).text();assert.equal(sha(after),sha(previousRules),'restore original emulator Rules');
await fs.writeFile('output/prd0062-'+mode+'-native-result.json',JSON.stringify({rulesPath,rulesSha256:sha(rulesText),results,passed:results.filter(r=>r.passed).length,total:results.length,namespace:projectId,restoredRulesSha256:sha(after),ownedDataRestored:true,beforeRulesPath,beforeDataPath},null,2)+'\n');
}
console.log(results.length+' native assertions passed');

