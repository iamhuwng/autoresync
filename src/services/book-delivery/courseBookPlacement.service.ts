export type CourseBookPins = Readonly<{ bookId:string; publicationId:string; unitVersionId:string; sourceVersionId:string; activityId:string; activityVersionId:string; bindingRevision:string }>;
export type CourseBookPlacement = Readonly<{ courseMaterialId:string; courseId:string; moduleId:string; ownerId:string; bindingId:string; status:'active'|'revoked'; pins:CourseBookPins }>;
export class CourseBookPlacementError extends Error { constructor(readonly code:string){super(code);} }
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const valid=(value:string)=>/^[A-Za-z0-9][A-Za-z0-9:_-]{2,159}$/u.test(value);
export const courseBookProjectionKey=(placement:CourseBookPlacement,studentId:string)=>`${placement.bindingId}:${studentId}:${placement.pins.activityId}:${placement.pins.activityVersionId}`;
/** #102 private-owner Course vertical. #104 consumes only the resolved projection. */
export const createCourseBookPlacementService=(records:Map<string,CourseBookPlacement>)=>({
  place(input:{actorId:string;courseId:string;moduleId:string;courseMaterialId:string;courseOwnerId:string;publicationOwnerId:string;pins:CourseBookPins}){
    if(![input.actorId,input.courseId,input.moduleId,input.courseMaterialId,...Object.values(input.pins)].every(valid))throw new CourseBookPlacementError('invalid');
    if(input.actorId!==input.courseOwnerId||input.actorId!==input.publicationOwnerId)throw new CourseBookPlacementError('forbidden');
    const next:Object=Object.freeze({courseMaterialId:input.courseMaterialId,courseId:input.courseId,moduleId:input.moduleId,ownerId:input.courseOwnerId,bindingId:`course:${input.courseId}:${input.courseMaterialId}:${input.pins.bindingRevision}`,status:'active' as const,pins:Object.freeze({...input.pins})});
    const placement=next as CourseBookPlacement; const old=records.get(placement.courseMaterialId); if(old&&equal(old,placement))return {kind:'replayed' as const,placement:old}; if(old)throw new CourseBookPlacementError('pin-conflict'); records.set(placement.courseMaterialId,placement);return {kind:'created' as const,placement};
  },
  resolve(input:{actorId:string;studentId:string;courseId:string;courseMaterialId?:string;enrolled:boolean;moduleReleased:boolean;pins:CourseBookPins}){
    if(input.actorId!==input.studentId||!input.enrolled||!input.moduleReleased||!input.courseMaterialId)throw new CourseBookPlacementError('denied'); const placement=records.get(input.courseMaterialId); if(!placement||placement.status!=='active'||placement.courseId!==input.courseId||!equal(placement.pins,input.pins))throw new CourseBookPlacementError('denied'); const key=courseBookProjectionKey(placement,input.studentId); return Object.freeze({projectionKind:'course-book-delivery-v1' as const,context:{kind:'course' as const,contextId:placement.courseId,courseMaterialId:placement.courseMaterialId},bindingId:placement.bindingId,bindingRevision:placement.pins.bindingRevision,pins:placement.pins,progressKey:key,resultKey:key});
  },
  revoke(actorId:string,courseMaterialId:string){const old=records.get(courseMaterialId);if(!old||old.ownerId!==actorId)throw new CourseBookPlacementError('forbidden');const next=Object.freeze({...old,status:'revoked' as const});records.set(courseMaterialId,next);return next;},
});
