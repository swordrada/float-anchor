import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { canvasSnapRects, labelHeight, snapCanvasRects } from './canvasSnapping'
import { useStore } from './store'
import type { Canvas } from './types'

const label = { id:'title', text:'标题', level:3 as const, x:0, y:0, width:200 }
const card = { id:'card', title:'卡片', content:'', x:100, y:150, width:300, height:200 }
const board: Canvas = { id:'board', name:'白板', cards:[card], labels:[label],
  sections:[{id:'section',name:'分区',color:'#ccc',x:600,y:100,width:500,height:500}] }

describe('canvas magnetic alignment', () => {
  const titleRect = { ...label, kind: 'label' as const }
  it('snaps a title above a card with exact UI height and 4px gap', () => {
    const y = card.y - labelHeight(label) - 4
    const r = snapCanvasRects([{...titleRect,x:102,y:y+3,height:labelHeight(label)}],canvasSnapRects(board))
    expect(r).toMatchObject({dx:-2,dy:-3,snappedX:true,snappedY:true})
  })
  it('uses a compact vertical gap in both directions and retains horizontal spacing', () => {
    expect(snapCanvasRects([{...card,id:'moving',y:354.96197133}],[card],0.704).dy)
      .toBeCloseTo(1.03802867)
    expect(snapCanvasRects([{...card,id:'moving',y:-59}],[card]).dy).toBe(3)
    expect(snapCanvasRects([{...card,id:'moving',x:410}],[card]).dx).toBe(2)
  })
  it('does not force adjacency once the pointer leaves the attraction range', () => {
    expect(snapCanvasRects([{...card,id:'moving',y:375}],[card],1))
      .toMatchObject({dy:0,snappedY:false})
  })
  it('snaps to section edges and centers', () => {
    const rect = {...titleRect,x:752,y:60,height:labelHeight(label)}
    expect(snapCanvasRects([rect],canvasSnapRects(board)).dx).toBe(-2)
  })
  it('snaps a card back to a title', () => {
    const title = {...titleRect,x:100,y:100,height:labelHeight(label)}
    expect(snapCanvasRects([{...card,x:103,y:100+title.height+6}], [title])).toMatchObject({dx:-3,dy:-2})
  })
  it('keeps a selection together and never attracts to itself or faraway objects', () => {
    const moving = [{...titleRect,x:102,y:108,height:38},{...titleRect,id:'second',x:402,y:108,height:38}]
    expect(snapCanvasRects(moving,[...moving,card])).toMatchObject({dx:-2,dy:0})
    expect(snapCanvasRects([{...titleRect,x:102,y:-2000,height:38}],[card])).toMatchObject({dx:0,dy:0})
  })
  it('uses screen-pixel tolerance at different zoom levels', () => {
    const r = {...titleRect,x:109,y:108,height:38}
    expect(snapCanvasRects([r],[card],0.5).dx).toBe(-9)
    expect(snapCanvasRects([r],[card],2).dx).toBe(0)
  })
})

describe('persisted title and connection actions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window',{electronAPI:{writeData:vi.fn().mockResolvedValue(true)}})
    useStore.setState({activeCanvasId:'board',canvases:[structuredClone(board)]})
  })
  afterEach(async () => { await useStore.getState().flushPendingSave(); vi.useRealTimers(); vi.unstubAllGlobals() })
  it('applies title snapping through the store', () => {
    useStore.getState().moveLabel('title',102,card.y-labelHeight(label)-2)
    expect(useStore.getState().canvases[0].labels![0]).toMatchObject({x:100,y:card.y-labelHeight(label)-4})
  })
  it('uses the viewport scale for single cards just like selection dragging', () => {
    const moving = {...card,id:'moving',y:400}
    const canvas = {...structuredClone(board),cards:[card,moving],labels:[],viewport:{panX:0,panY:0,scale:0.5}}
    useStore.setState({canvases:[canvas]})
    useStore.getState().moveCard('moving',109,365)
    const moved = useStore.getState().canvases[0].cards[1]
    const snap = snapCanvasRects([{...moving,x:109,y:365}],canvasSnapRects(canvas),0.5)
    expect(moved).toMatchObject({x:109+snap.dx,y:365+snap.dy})
    expect(moved).toMatchObject({x:100,y:356})
  })
  it('recognizes vertical snapping to a section member when releasing outside its bounds', () => {
    const member = {...card,x:100,y:100,width:300,height:200}
    const moving = {...card,id:'moving',x:100,y:306,width:300,height:200}
    useStore.setState({canvases:[{...board,cards:[member,moving],labels:[],sections:[
      {id:'section',name:'分区',color:'#ccc',x:76,y:40,width:348,height:284,cardIds:['card']}
    ]}]})
    useStore.getState().finalizeCardMove('moving')
    expect(useStore.getState().canvases[0].sections![0].cardIds).toContain('moving')
  })
  it('retains routing metadata through edits and persistence', async () => {
    const store = useStore.getState()
    store.addConnection('card','title')
    const connection = useStore.getState().canvases[0].connections![0]
    expect(connection.routing).toBe('elbow')
    store.updateConnection(connection.id,{fromSide:'right',toSide:'left',laneOffset:24})
    await store.flushPendingSave()
    const saved = vi.mocked(window.electronAPI.writeData).mock.calls.at(-1)![0]
    expect(saved.canvases[0].connections![0]).toMatchObject({routing:'elbow',fromSide:'right',toSide:'left',laneOffset:24})
  })
})
