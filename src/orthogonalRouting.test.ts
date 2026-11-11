import { describe, expect, it } from 'vitest'
import { getConnectionGeometry, getConnectionPreview } from './connectionGeometry'
import { getPlannedConnection, segmentHitsBounds } from './orthogonalRouting'
import { contentFingerprint, preserveLocalView } from './lib/syncData'

const from = {x:0,y:0,width:200,height:120}
const to = {x:400,y:400,width:200,height:160}
describe('planned connection routing', () => {
  it('preserves column lanes instead of choosing a shorter diagonal mixed-side route', () => {
    const a = getPlannedConnection(from,to,{routing:'elbow'})
    const b = getPlannedConnection({...from,y:240},to,{routing:'elbow'})
    expect(a.start.side).toBe('right'); expect(a.end.side).toBe('left')
    expect(a.points).toEqual([{x:200,y:60,side:'right'},{x:300,y:60},{x:300,y:480},{x:400,y:480,side:'left'}])
    expect(b.points[1].x).toBe(300)
  })
  it('keeps stacked stages vertical and honors explicit entry sides', () => {
    const a = getPlannedConnection(from,{...from,y:250},{routing:'elbow',toSide:'top'})
    expect(a.points).toHaveLength(2)
    expect(a.start.side).toBe('bottom'); expect(a.end.side).toBe('top')
    expect(getPlannedConnection(from,to,{routing:'elbow',toSide:'top'}).end.side).toBe('top')
  })
  it('routes around an intervening card without crossing any card interior', () => {
    const target = {...from,x:600}
    const blocker = {...from,x:280,y:-80,width:240,height:300}
    const route = getPlannedConnection(from,target,{routing:'elbow'},[from,blocker,target])
    for (let i=1;i<route.points.length;i++) for (const card of [from,blocker,target]) {
      expect(segmentHitsBounds(route.points[i-1],route.points[i],card)).toBe(false)
    }
    expect(route.points.some(p => p.y < -80 || p.y > 220)).toBe(true)
  })
  it('can exit and enter the same side without reversing through the endpoint cards', () => {
    const route = getPlannedConnection(from,to,{routing:'elbow',fromSide:'right',toSide:'right'})
    expect(route.start.side).toBe('right'); expect(route.end.side).toBe('right')
    for (let i=1;i<route.points.length;i++) for (const card of [from,to])
      expect(segmentHitsBounds(route.points[i-1],route.points[i],card)).toBe(false)
  })
  it('keeps a manually shifted lane relative to the endpoints when they move', () => {
    const route = {routing:'elbow' as const,laneOffset:24}
    const a = getPlannedConnection(from,to,route)
    const b = getPlannedConnection({...from,x:50},{...to,x:450},route)
    expect(a.points[1].x).toBe(324); expect(b.points[1].x).toBe(374)
  })
  it('retains imported manual lane coordinates', () => {
    const route = getPlannedConnection(from,to,{routing:'elbow',controlPoints:[{direction:'vertical',x:340,y:200}]})
    expect(route.points[1].x).toBe(340)
    expect(route.points[2].x).toBe(340)
  })
  it('matches preview and saved routes, keeping legacy curves unchanged', () => {
    const route = {routing:'elbow' as const,toSide:'left' as const}
    expect(getConnectionPreview(from,{x:401,y:410},to,route,[from,to])).toEqual(getConnectionGeometry(from,to,route,[from,to]))
    expect(getConnectionGeometry(from,to).path).toContain(' C ')
    expect(getConnectionGeometry(from,to,route).path).toContain(' L ')
  })
  it('includes route changes in sync fingerprints and preserves them during downloads', () => {
    const connection = {id:'c',fromCardId:'a',toCardId:'b',routing:'elbow',toSide:'left',laneOffset:24}
    const data = {activeCanvasId:'cv',canvases:[{id:'cv',cards:[],connections:[connection]}]}
    const local = {...data,canvases:[{...data.canvases[0],connections:[{...connection,laneOffset:0}],viewport:{scale:2,panX:1,panY:2}}]}
    expect(contentFingerprint(data)).not.toBe(contentFingerprint(local))
    expect(preserveLocalView(data,local).canvases[0].connections[0]).toEqual(connection)
  })
})
