import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectionNodes } from './connectionNodes'
import { getConnectionGeometry } from './connectionGeometry'
import { sourceConnectionSides } from './connectionAnchors'
import { useStore } from './store'
import type { Canvas } from './types'
const board: Canvas = {id:'board',name:'Imported',cards:[{id:'card',title:'Note',content:'unchanged',x:500,y:100,width:200,height:200}],
  labels:[{id:'title',text:'Heading',level:3,x:0,y:0,width:200}],
  sections:[{id:'section',name:'Group',x:500,y:500,width:600,height:800,color:'#ccc',cardIds:[]}],connections:[]}
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window',{electronAPI:{writeData:vi.fn(async()=>true)}})
  useStore.setState({activeCanvasId:'board',canvases:[structuredClone(board)],settings:{theme:'light',syncProvider:'none'},syncDecision:null})
})
afterEach(async () => {await useStore.getState().flushPendingSave(); vi.useRealTimers(); vi.unstubAllGlobals()})
describe('connections across canvas objects',()=>{
  it('uses actual heading height and updates endpoints after a move',()=>{
    let nodes=connectionNodes(board)
    const first=getConnectionGeometry(nodes.get('title')!,nodes.get('section')!,{routing:'elbow'})
    expect(nodes.get('title')!.height).toBeCloseTo(37.4)
    const moved=structuredClone(board); moved.sections![0].y+=200
    nodes=connectionNodes(moved)
    const second=getConnectionGeometry(nodes.get('title')!,nodes.get('section')!,{routing:'elbow'})
    expect(second.end.y-first.end.y).toBe(200)
  })
  it('creates title-to-section and section-to-card links, rejects missing IDs and duplicates',()=>{
    const s=useStore.getState()
    s.addConnection('title','section');s.addConnection('section','card');s.addConnection('missing','card');s.addConnection('title','section')
    expect(useStore.getState().canvases[0].connections).toHaveLength(2)
  })
  it('deleting a title removes its links, deleting a section preserves its cards',()=>{
    const s=useStore.getState();s.addConnection('title','section');s.addConnection('section','card')
    s.deleteLabel('title'); expect(useStore.getState().canvases[0].connections).toHaveLength(1)
    s.deleteSection('section');expect(useStore.getState().canvases[0].connections).toHaveLength(0)
    expect(useStore.getState().canvases[0].cards).toEqual(board.cards)
  })
  it('bulk deletion removes links attached to non-card objects',()=>{
    const s=useStore.getState();s.addConnection('title','card');s.addConnection('section','card')
    s.deleteUnits({cardIds:[],textIds:[],labelIds:['title'],sectionIds:['section']})
    expect(useStore.getState().canvases[0].connections).toEqual([])
  })
  it('respects source automatic choices when the opposite side is fixed',()=>{
    const a={x:0,y:0,width:200,height:100},b={x:400,y:400,width:200,height:100}
    expect(sourceConnectionSides(a,b,{toSide:'top'})).toEqual(['right','top'])
    expect(sourceConnectionSides(b,a,{toSide:'top'})).toEqual(['top','top'])
    expect(sourceConnectionSides(a,b,{controlPoints:[{x:-200,y:50}]})).toEqual(['left','left'])
  })
  it('retains manual curve waypoints and fixed endpoint tangents',()=>{
    const nodes=connectionNodes(board), waypoint={x:300,y:-200}
    const curve=getConnectionGeometry(nodes.get('card')!,nodes.get('section')!,{routing:'curve',anchorMode:'heptabase',fromSide:'left',toSide:'top',controlPoints:[waypoint]})
    expect(curve.path).toContain('300 -200')
    expect(curve.c1.x).toBeLessThan(curve.start.x)
    expect(curve.c2.y).toBeLessThan(curve.end.y)
  })
})
