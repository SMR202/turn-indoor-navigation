import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { placeCategories, type PlaceCategory } from '@turn/design';
import {
  checkDraft,
  detectRooms,
  draftToGeoJson,
  emptyDraft,
  floorToDraft,
  inkFromRgba,
  nearestEdge,
  polygonAreaUnits,
  snapPoint,
  type DraftDoor,
  type DraftPlace,
  type DraftRoom,
  type DraftRoomKind,
  type PlanDraft,
  type Snap,
  type VenuePackage,
} from '@turn/venue-model';
import { api, ApiError, type ImportReport, type Validation } from '../api';
import { Icon, useToast } from '../ui';
import type { Floor } from './Venue';

type P = { x: number; y: number };
type Tool = 'select' | 'rect' | 'poly' | 'door' | 'place' | 'scale' | 'pan';
type Selection = { type: 'room' | 'door' | 'place'; id: string } | null;
type Picture = { url: string; width: number; height: number };

const TOOLS: { tool: Tool; label: string; key: string; hint: string }[] = [
  {
    tool: 'select',
    label: 'Select',
    key: 'V',
    hint: 'Click a room, door or place to change it. Drag to move; drag a corner to reshape.',
  },
  {
    tool: 'rect',
    label: 'Room',
    key: 'R',
    hint: 'Drag from one corner of a room to the opposite corner.',
  },
  {
    tool: 'poly',
    label: 'Shape',
    key: 'P',
    hint: 'Click each corner in turn. Click the first corner again, or press Enter, to finish.',
  },
  {
    tool: 'door',
    label: 'Door',
    key: 'D',
    hint: 'Click on a wall where there is a door or an opening.',
  },
  {
    tool: 'place',
    label: 'Place',
    key: 'L',
    hint: 'Click to add a place that is not a room: a kiosk, a desk, a machine.',
  },
  {
    tool: 'scale',
    label: 'Scale',
    key: 'S',
    hint: 'Click the two ends of something whose real length you know.',
  },
  {
    tool: 'pan',
    label: 'Move',
    key: 'H',
    hint: 'Drag to move the sheet. The mouse wheel zooms.',
  },
];
const KINDS: { kind: DraftRoomKind; label: string }[] = [
  { kind: 'room', label: 'Room (a place to go to)' },
  { kind: 'circulation', label: 'Corridor or hall' },
  { kind: 'stairs', label: 'Stairs or lift' },
  { kind: 'outdoor', label: 'Outdoor area' },
  { kind: 'fixture', label: 'Fixed furniture or column' },
];
const FILL: Record<DraftRoomKind, string> = {
  room: 'rgba(47,90,242,0.14)',
  circulation: 'rgba(255,255,255,0.72)',
  stairs: 'rgba(86,103,130,0.22)',
  outdoor: 'rgba(74,138,58,0.18)',
  fixture: 'rgba(110,119,135,0.28)',
};
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'floor';
const centre = (pts: P[]): P => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
});
const nextId = (prefix: string, taken: string[]) => {
  let n = taken.length + 1;
  while (taken.includes(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
};

/**
 * Draw or trace a floor (Plan 005 §9.2): put a plan picture under the sheet, set the scale, draw
 * rooms and doors (or let TURN detect them), then build. Building runs the ordinary importer, so
 * walls and the walk graph are made the same way as for imported files.
 */
export function PlanEditor({
  venueId,
  floors,
  pkg,
  editFloorId,
  onClose,
  onBuilt,
}: {
  venueId: string;
  floors: Floor[];
  pkg: VenuePackage | null;
  /** Reshape this existing floor; otherwise a new floor is drawn. */
  editFloorId: string | null;
  onClose: () => void;
  onBuilt: (
    floorId: string,
    result: { report: ImportReport; validation: Validation },
  ) => void;
}) {
  const toast = useToast();
  const editing = floors.find((f) => f.id === editFloorId) ?? null;
  const storeKey = `turn.plan-draft.${venueId}.${editFloorId ?? 'new'}`;
  const start = useMemo(() => {
    try {
      const saved = localStorage.getItem(storeKey);
      if (saved)
        return {
          draft: JSON.parse(saved) as PlanDraft,
          restored: true,
          lossy: false,
        };
    } catch {
      // A broken saved drawing is ignored.
    }
    const from = pkg && editFloorId ? floorToDraft(pkg, editFloorId) : null;
    return {
      draft: from?.draft ?? emptyDraft(),
      restored: false,
      lossy: from?.lossy ?? false,
    };
  }, [storeKey, pkg, editFloorId]);

  // ---- The drawing, with undo ------------------------------------------------------------------
  const [history, setHistory] = useState<{
    past: PlanDraft[];
    present: PlanDraft;
    future: PlanDraft[];
  }>({ past: [], present: start.draft, future: [] });
  const draft = history.present;
  const commit = useCallback(
    (next: PlanDraft | ((d: PlanDraft) => PlanDraft)) =>
      setHistory((h) => {
        const present = typeof next === 'function' ? next(h.present) : next;
        if (present === h.present) return h;
        return { past: [...h.past.slice(-80), h.present], present, future: [] };
      }),
    [],
  );
  const undo = () =>
    setHistory((h) =>
      h.past.length
        ? {
            past: h.past.slice(0, -1),
            present: h.past.at(-1)!,
            future: [h.present, ...h.future],
          }
        : h,
    );
  const redo = () =>
    setHistory((h) =>
      h.future.length
        ? {
            past: [...h.past, h.present],
            present: h.future[0]!,
            future: h.future.slice(1),
          }
        : h,
    );
  useEffect(() => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(draft));
    } catch {
      // Storage full or blocked: the drawing still lives in memory.
    }
  }, [draft, storeKey]);

  const [tool, setTool] = useState<Tool>('select');
  const [selected, setSelected] = useState<Selection>(null);
  const [picture, setPicture] = useState<Picture | null>(null);
  const [opacity, setOpacity] = useState(0.6);
  const [label, setLabel] = useState(
    editing?.label ??
      (floors.length
        ? `Level ${Math.max(...floors.map((f) => f.level)) + 1}`
        : 'Ground floor'),
  );
  const [level, setLevel] = useState(
    editing?.level ??
      (floors.length ? Math.max(...floors.map((f) => f.level)) + 1 : 0),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doorWidth, setDoorWidth] = useState(1);

  // ---- View: zoom and pan ---------------------------------------------------------------------
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ k: 0.4, tx: 20, ty: 20 });
  const fit = useCallback((w: number, h: number) => {
    const el = svg.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const k = Math.min((r.width - 48) / w, (r.height - 48) / h);
    setView({ k, tx: (r.width - w * k) / 2, ty: (r.height - h * k) / 2 });
  }, []);
  useEffect(() => {
    fit(start.draft.width, start.draft.height);
  }, [fit, start]);
  const toPlan = (e: { clientX: number; clientY: number }): P => {
    const r = svg.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - view.tx) / view.k,
      y: (e.clientY - r.top - view.ty) / view.k,
    };
  };
  /** Screen pixels as plan units, so handles and snapping feel the same at any zoom. */
  const px = (n: number) => n / view.k;
  const clamp = (p: P): P => ({
    x: Math.max(0, Math.min(draft.width, p.x)),
    y: Math.max(0, Math.min(draft.height, p.y)),
  });

  // ---- Transient state while drawing or dragging ------------------------------------------------
  const [hover, setHover] = useState<Snap | null>(null);
  const [rectStart, setRectStart] = useState<P | null>(null);
  const [poly, setPoly] = useState<P[]>([]);
  const [scalePts, setScalePts] = useState<P[]>([]);
  const [scaleMetres, setScaleMetres] = useState('');
  /** The drawing as it looks mid-drag; committed on release. */
  const [live, setLive] = useState<PlanDraft | null>(null);
  const shown = live ?? draft;
  const drag = useRef<
    | { kind: 'pan'; x: number; y: number; tx: number; ty: number }
    | { kind: 'room'; id: string; from: P; base: PlanDraft }
    | { kind: 'corner'; id: string; index: number; base: PlanDraft }
    | { kind: 'door'; id: string; base: PlanDraft }
    | { kind: 'place'; id: string; base: PlanDraft }
    | null
  >(null);
  const space = useRef(false);

  const check = useMemo(() => checkDraft(draft), [draft]);
  const room =
    selected?.type === 'room'
      ? draft.rooms.find((r) => r.id === selected.id)
      : undefined;
  const door =
    selected?.type === 'door'
      ? draft.doors.find((d) => d.id === selected.id)
      : undefined;
  const place =
    selected?.type === 'place'
      ? draft.places.find((p) => p.id === selected.id)
      : undefined;

  const closePoly = useCallback(() => {
    setPoly((pts) => {
      if (pts.length >= 3) {
        const id = nextId(
          'room',
          draft.rooms.map((r) => r.id),
        );
        commit((d) => ({
          ...d,
          rooms: [...d.rooms, { id, name: '', kind: 'room', points: pts }],
        }));
        setSelected({ type: 'room', id });
        setTool('select');
      }
      return [];
    });
  }, [commit, draft.rooms]);
  const removeSelected = useCallback(() => {
    if (!selected) return;
    commit((d) => ({
      ...d,
      rooms:
        selected.type === 'room'
          ? d.rooms.filter((r) => r.id !== selected.id)
          : d.rooms,
      doors:
        selected.type === 'door'
          ? d.doors.filter((x) => x.id !== selected.id)
          : d.doors,
      places:
        selected.type === 'place'
          ? d.places.filter((x) => x.id !== selected.id)
          : d.places,
    }));
    setSelected(null);
  }, [commit, selected]);

  useEffect(() => {
    const typing = (e: KeyboardEvent) =>
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(
        (e.target as HTMLElement)?.tagName,
      );
    const down = (e: KeyboardEvent) => {
      if (e.key === ' ' && !typing(e)) {
        space.current = true;
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (typing(e)) return;
      if (e.key === 'Escape') {
        if (rectStart || poly.length || scalePts.length) {
          setRectStart(null);
          setPoly([]);
          setScalePts([]);
        } else if (selected) setSelected(null);
        else setTool('select');
      } else if (e.key === 'Enter' && poly.length >= 3) closePoly();
      else if (e.key === 'Delete' || e.key === 'Backspace') removeSelected();
      else {
        const t = TOOLS.find(
          (x) => x.key.toLowerCase() === e.key.toLowerCase(),
        );
        if (t && !e.ctrlKey && !e.metaKey) setTool(t.tool);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [
    rectStart,
    poly.length,
    scalePts.length,
    selected,
    closePoly,
    removeSelected,
  ]);

  // ---- Pointer -------------------------------------------------------------------------------
  const snapAt = (
    e: { clientX: number; clientY: number },
    anchor?: P | null,
    skipRoom?: string,
  ) => snapPoint(clamp(toPlan(e)), shown, px(9), { anchor, skipRoom });

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (e.button === 1 || tool === 'pan' || space.current) {
      drag.current = {
        kind: 'pan',
        x: e.clientX,
        y: e.clientY,
        tx: view.tx,
        ty: view.ty,
      };
      return;
    }
    if (e.button !== 0) return;
    const raw = clamp(toPlan(e));
    if (tool === 'rect') setRectStart(snapAt(e).point);
    else if (tool === 'poly') {
      const s = snapAt(e, poly.at(-1) ?? null).point;
      const first = poly[0];
      if (
        first &&
        poly.length >= 3 &&
        Math.hypot(s.x - first.x, s.y - first.y) <= px(10)
      )
        closePoly();
      else setPoly((pts) => [...pts, s]);
    } else if (tool === 'door') {
      const edge = nearestEdge(raw, draft);
      if (!edge || edge.distance > px(18)) {
        setError('Click on a wall to put a door there.');
        return;
      }
      setError(null);
      const id = nextId(
        'door',
        draft.doors.map((d) => d.id),
      );
      commit((d) => ({ ...d, doors: [...d.doors, { id, ...edge.point }] }));
    } else if (tool === 'place') {
      const id = nextId(
        'place',
        draft.places.map((p) => p.id),
      );
      commit((d) => ({
        ...d,
        places: [
          ...d.places,
          { id, name: 'New place', category: 'service', ...raw },
        ],
      }));
      setSelected({ type: 'place', id });
      setTool('select');
    } else if (tool === 'scale') {
      setScalePts((pts) =>
        pts.length >= 2 ? [raw] : [...pts, snapAt(e).point],
      );
    } else if (tool === 'select') {
      // Shapes handle their own presses; a press on empty sheet clears the selection.
      setSelected(null);
    }
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (d?.kind === 'pan') {
      setView((v) => ({
        ...v,
        tx: d.tx + e.clientX - d.x,
        ty: d.ty + e.clientY - d.y,
      }));
      return;
    }
    if (d?.kind === 'room') {
      const p = toPlan(e);
      const dx = p.x - d.from.x;
      const dy = p.y - d.from.y;
      setLive({
        ...d.base,
        rooms: d.base.rooms.map((r) =>
          r.id === d.id
            ? {
                ...r,
                points: r.points.map((q) =>
                  clamp({ x: q.x + dx, y: q.y + dy }),
                ),
              }
            : r,
        ),
      });
      return;
    }
    if (d?.kind === 'corner') {
      const r0 = d.base.rooms.find((r) => r.id === d.id)!;
      const prev =
        r0.points[(d.index + r0.points.length - 1) % r0.points.length]!;
      const s = snapPoint(clamp(toPlan(e)), d.base, px(9), {
        anchor: prev,
        skipRoom: d.id,
      });
      setHover(s);
      setLive({
        ...d.base,
        rooms: d.base.rooms.map((r) =>
          r.id === d.id
            ? {
                ...r,
                points: r.points.map((q, i) => (i === d.index ? s.point : q)),
              }
            : r,
        ),
      });
      return;
    }
    if (d?.kind === 'door') {
      const edge = nearestEdge(clamp(toPlan(e)), d.base);
      if (edge)
        setLive({
          ...d.base,
          doors: d.base.doors.map((x) =>
            x.id === d.id ? { ...x, ...edge.point } : x,
          ),
        });
      return;
    }
    if (d?.kind === 'place') {
      const p = clamp(toPlan(e));
      setLive({
        ...d.base,
        places: d.base.places.map((x) => (x.id === d.id ? { ...x, ...p } : x)),
      });
      return;
    }
    if (tool === 'rect' || tool === 'poly' || tool === 'scale')
      setHover(snapAt(e, tool === 'poly' ? (poly.at(-1) ?? null) : null));
    else if (tool === 'door') {
      const edge = nearestEdge(clamp(toPlan(e)), draft);
      setHover(
        edge && edge.distance <= px(18)
          ? { point: edge.point, to: 'edge' }
          : null,
      );
    } else setHover(null);
  };
  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d && d.kind !== 'pan' && live) {
      commit(live);
      setLive(null);
      return;
    }
    setLive(null);
    if (tool === 'rect' && rectStart) {
      const end = snapAt(e).point;
      const w = Math.abs(end.x - rectStart.x);
      const h = Math.abs(end.y - rectStart.y);
      setRectStart(null);
      // Smaller than a cupboard on screen is a slip of the hand, not a room.
      if (w < px(8) || h < px(8)) return;
      const x0 = Math.min(rectStart.x, end.x);
      const y0 = Math.min(rectStart.y, end.y);
      const id = nextId(
        'room',
        draft.rooms.map((r) => r.id),
      );
      commit((dr) => ({
        ...dr,
        rooms: [
          ...dr.rooms,
          {
            id,
            name: '',
            kind: 'room',
            points: [
              { x: x0, y: y0 },
              { x: x0 + w, y: y0 },
              { x: x0 + w, y: y0 + h },
              { x: x0, y: y0 + h },
            ],
          },
        ],
      }));
      setSelected({ type: 'room', id });
    }
  };
  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    setView((v) => {
      const k = Math.max(
        0.03,
        Math.min(12, v.k * Math.exp(-e.deltaY * 0.0015)),
      );
      return {
        k,
        tx: mx - ((mx - v.tx) / v.k) * k,
        ty: my - ((my - v.ty) / v.k) * k,
      };
    });
  };
  const pick = (
    sel: NonNullable<Selection>,
    e: React.PointerEvent,
    begin: () => void,
  ) => {
    if (tool !== 'select' || space.current || e.button !== 0) return;
    e.stopPropagation();
    svg.current?.setPointerCapture(e.pointerId);
    setSelected(sel);
    begin();
  };

  // ---- Picture, scale, detection, build -----------------------------------------------------------
  const loadPicture = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      const img = new Image();
      img.onload = () => {
        const p = { url, width: img.naturalWidth, height: img.naturalHeight };
        setPicture(p);
        // An empty sheet takes the picture's size, so plan units are its pixels.
        if (!draft.rooms.length && !draft.doors.length) {
          commit((d) => ({
            ...d,
            width: p.width,
            height: p.height,
            scaled: false,
          }));
          fit(p.width, p.height);
          setTool('scale');
        }
      };
      img.onerror = () =>
        setError(
          'That file could not be read as a picture. Use a PNG or JPEG.',
        );
      img.src = url;
    };
    reader.readAsDataURL(file);
  };
  /** The picture is drawn across the whole sheet width. */
  const pictureHeight = picture
    ? (draft.width * picture.height) / picture.width
    : 0;

  const applyScale = () => {
    const metres = Number(scaleMetres.replace(',', '.'));
    const [a, b] = scalePts;
    if (!a || !b || !(metres > 0)) return;
    const units = Math.hypot(b.x - a.x, b.y - a.y);
    if (units < 1) return;
    commit((d) => ({ ...d, metresPerUnit: metres / units, scaled: true }));
    setScalePts([]);
    setScaleMetres('');
    setTool('rect');
    toast(
      `Scale set: the sheet is ${((draft.width * metres) / units).toFixed(1)} m wide`,
    );
  };

  const detect = async () => {
    if (!picture) return;
    if (
      draft.rooms.length &&
      !window.confirm(
        `Replace the ${draft.rooms.length} rooms drawn so far with detected ones?`,
      )
    )
      return;
    setBusy('Looking for rooms…');
    setError(null);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const img = new Image();
      await new Promise<void>((ok, bad) => {
        img.onload = () => ok();
        img.onerror = () => bad(new Error('picture'));
        img.src = picture.url;
      });
      const s = Math.min(1, 1400 / Math.max(picture.width, picture.height));
      const w = Math.round(picture.width * s);
      const h = Math.round(picture.height * s);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      // Sheet units per detection pixel (the picture spans the sheet's width).
      const unit = draft.width / w;
      const metresPerPixel = draft.metresPerUnit * unit;
      const doorPx = draft.scaled ? doorWidth / metresPerPixel : w * 0.016;
      const found = detectRooms(
        inkFromRgba(ctx.getImageData(0, 0, w, h).data, w, h),
        {
          closeRadius: Math.max(2, Math.min(40, Math.ceil(doorPx * 0.6))),
          minArea: draft.scaled ? 1.5 / metresPerPixel ** 2 : w * h * 0.0009,
        },
      );
      if (!found.rooms.length) {
        setError(
          'No closed rooms were found. Check that walls are dark lines on a light background, set the scale first, or draw the rooms by hand.',
        );
        return;
      }
      const rooms: DraftRoom[] = found.rooms.map((r, i) => ({
        id: `room-${i + 1}`,
        name: r.circulation ? 'Corridor' : '',
        kind: r.circulation ? 'circulation' : 'room',
        points: r.polygon.map((p) => ({ x: p.x * unit, y: p.y * unit })),
      }));
      const doors: DraftDoor[] = found.doors.map((d, i) => ({
        id: `door-${i + 1}`,
        x: d.x * unit,
        y: d.y * unit,
      }));
      commit((d) => ({ ...d, rooms, doors }));
      setSelected(null);
      setTool('select');
      toast(
        `Found ${rooms.length} rooms and ${doors.length} doors. Check them, then name the rooms.`,
      );
    } catch {
      setError('The picture could not be analysed.');
    } finally {
      setBusy(null);
    }
  };

  const build = async () => {
    if (check.errors.length) return;
    setBusy('Building the floor…');
    setError(null);
    const floorId = editing?.id ?? (pkg ? slug(label) : 'ground');
    try {
      const geojson = draftToGeoJson(draft);
      const result = await api<{
        report: ImportReport;
        validation: Validation;
      }>(`/venues/${venueId}/import`, {
        body: pkg
          ? { geojson, floorLabel: label, floorId, level }
          : { geojson, floorLabel: label },
      });
      localStorage.removeItem(storeKey);
      toast(
        `${label} built: ${result.report.rooms} rooms, ${result.report.places} places`,
      );
      onBuilt(floorId, result);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : 'The floor could not be built.',
      );
    } finally {
      setBusy(null);
    }
  };
  const startOver = () => {
    localStorage.removeItem(storeKey);
    const from = pkg && editFloorId ? floorToDraft(pkg, editFloorId) : null;
    setHistory({ past: [], present: from?.draft ?? emptyDraft(), future: [] });
    setSelected(null);
  };

  // ---- Small editors for the side panel ---------------------------------------------------------
  const patchRoom = (id: string, patch: Partial<DraftRoom>) =>
    commit((d) => ({
      ...d,
      rooms: d.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  const patchDoor = (id: string, patch: Partial<DraftDoor>) =>
    commit((d) => ({
      ...d,
      doors: d.doors.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  const patchPlace = (id: string, patch: Partial<DraftPlace>) =>
    commit((d) => ({
      ...d,
      places: d.places.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  const metres = (units: number) => units * draft.metresPerUnit;
  const grid = draft.scaled
    ? (() => {
        const one = 1 / draft.metresPerUnit;
        return one * view.k >= 14 ? one : one * 5;
      })()
    : null;
  const preview: P[] | null =
    tool === 'rect' && rectStart && hover
      ? [
          rectStart,
          { x: hover.point.x, y: rectStart.y },
          hover.point,
          { x: rectStart.x, y: hover.point.y },
        ]
      : null;
  const hint = TOOLS.find((t) => t.tool === tool)!.hint;

  return createPortal(
    <div
      className="plan-editor"
      role="dialog"
      aria-modal="true"
      aria-label="Draw a floor"
    >
      <header className="plan-bar">
        <div className="row" style={{ gap: 12, minWidth: 0 }}>
          <b>{editing ? `Edit ${editing.label}` : 'Draw a floor'}</b>
          {!editing && (
            <>
              <input
                className="input"
                style={{ width: 170 }}
                value={label}
                aria-label="Floor name"
                onChange={(e) => setLabel(e.target.value)}
              />
              {pkg && (
                <label className="row subtle" style={{ gap: 6 }}>
                  Level
                  <input
                    className="input"
                    style={{ width: 64 }}
                    type="number"
                    value={level}
                    onChange={(e) => setLevel(Number(e.target.value) || 0)}
                  />
                </label>
              )}
            </>
          )}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn sm"
            onClick={undo}
            disabled={!history.past.length}
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            className="btn sm"
            onClick={redo}
            disabled={!history.future.length}
            title="Redo (Ctrl+Shift+Z)"
          >
            Redo
          </button>
          <label className="btn sm">
            {picture ? 'Change picture' : 'Add plan picture'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadPicture(f);
                e.target.value = '';
              }}
            />
          </label>
          {picture && (
            <label className="row subtle" style={{ gap: 6 }}>
              Picture
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={opacity}
                aria-label="Picture strength"
                onChange={(e) => setOpacity(Number(e.target.value))}
              />
            </label>
          )}
          <button
            className="btn sm"
            onClick={() => fit(draft.width, draft.height)}
          >
            Fit
          </button>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button
            className="btn primary"
            disabled={!!busy || check.errors.length > 0}
            onClick={() => void build()}
          >
            <Icon name="check" size={15} /> Build floor
          </button>
        </div>
      </header>
      <div className="plan-body">
        <nav className="plan-tools" aria-label="Tools">
          {TOOLS.map((t) => (
            <button
              key={t.tool}
              className={tool === t.tool ? 'on' : ''}
              title={`${t.hint} (${t.key})`}
              aria-pressed={tool === t.tool}
              onClick={() => {
                setTool(t.tool);
                setRectStart(null);
                setPoly([]);
                setScalePts([]);
              }}
            >
              {t.label}
              <kbd>{t.key}</kbd>
            </button>
          ))}
        </nav>
        <div className="plan-canvas">
          <svg
            ref={svg}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onWheel={onWheel}
            onDoubleClick={() => tool === 'poly' && closePoly()}
            style={{
              cursor:
                tool === 'pan'
                  ? 'grab'
                  : tool === 'select'
                    ? 'default'
                    : 'crosshair',
            }}
          >
            <defs>
              {grid && (
                <pattern
                  id="plan-grid"
                  width={grid}
                  height={grid}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${grid} 0 L 0 0 0 ${grid}`}
                    fill="none"
                    stroke="rgba(11,18,32,0.08)"
                    strokeWidth={px(1)}
                  />
                </pattern>
              )}
            </defs>
            <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
              <rect
                width={draft.width}
                height={draft.height}
                fill="#fff"
                stroke="rgba(11,18,32,0.25)"
                strokeWidth={px(1)}
              />
              {picture && (
                <image
                  href={picture.url}
                  width={draft.width}
                  height={pictureHeight}
                  opacity={opacity}
                  preserveAspectRatio="none"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {grid && (
                <rect
                  width={draft.width}
                  height={draft.height}
                  fill="url(#plan-grid)"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {shown.rooms.map((r) => {
                const on = selected?.type === 'room' && selected.id === r.id;
                const noDoor =
                  check.roomsWithoutDoor.includes(r.id) &&
                  draft.rooms.length > 1;
                const c = centre(r.points);
                return (
                  <g key={r.id}>
                    <polygon
                      points={r.points.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill={FILL[r.kind]}
                      stroke={on ? '#2F5AF2' : noDoor ? '#B7791F' : '#0B1220'}
                      strokeWidth={px(on ? 2.5 : 1.5)}
                      strokeDasharray={
                        noDoor && !on ? `${px(6)} ${px(4)}` : undefined
                      }
                      style={{
                        pointerEvents: tool === 'select' ? 'auto' : 'none',
                        cursor: tool === 'select' ? 'move' : undefined,
                      }}
                      onPointerDown={(e) =>
                        pick({ type: 'room', id: r.id }, e, () => {
                          drag.current = {
                            kind: 'room',
                            id: r.id,
                            from: toPlan(e),
                            base: draft,
                          };
                        })
                      }
                    />
                    <text
                      x={c.x}
                      y={c.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={px(12)}
                      fontWeight={600}
                      fill={r.name ? '#0B1220' : '#8A919E'}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {r.name || (r.kind === 'room' ? 'Unnamed' : '')}
                    </text>
                  </g>
                );
              })}
              {room &&
                (live ?? draft).rooms
                  .find((r) => r.id === room.id)
                  ?.points.map((p, i) => (
                    <rect
                      key={i}
                      x={p.x - px(5)}
                      y={p.y - px(5)}
                      width={px(10)}
                      height={px(10)}
                      fill="#fff"
                      stroke="#2F5AF2"
                      strokeWidth={px(2)}
                      style={{ cursor: 'nwse-resize' }}
                      onPointerDown={(e) =>
                        pick({ type: 'room', id: room.id }, e, () => {
                          drag.current = {
                            kind: 'corner',
                            id: room.id,
                            index: i,
                            base: draft,
                          };
                        })
                      }
                    />
                  ))}
              {shown.doors.map((d) => {
                const on = selected?.type === 'door' && selected.id === d.id;
                const stray = check.strayDoors.includes(d.id);
                return (
                  <circle
                    key={d.id}
                    cx={d.x}
                    cy={d.y}
                    r={px(on ? 7 : 5.5)}
                    fill={stray ? '#B7791F' : '#1F8A5B'}
                    stroke="#fff"
                    strokeWidth={px(2)}
                    style={{
                      pointerEvents: tool === 'select' ? 'auto' : 'none',
                      cursor: 'move',
                    }}
                    onPointerDown={(e) =>
                      pick({ type: 'door', id: d.id }, e, () => {
                        drag.current = { kind: 'door', id: d.id, base: draft };
                      })
                    }
                  />
                );
              })}
              {shown.places.map((p) => {
                const on = selected?.type === 'place' && selected.id === p.id;
                return (
                  <g key={p.id}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={px(on ? 7 : 5.5)}
                      fill="#8256C2"
                      stroke="#fff"
                      strokeWidth={px(2)}
                      style={{
                        pointerEvents: tool === 'select' ? 'auto' : 'none',
                        cursor: 'move',
                      }}
                      onPointerDown={(e) =>
                        pick({ type: 'place', id: p.id }, e, () => {
                          drag.current = {
                            kind: 'place',
                            id: p.id,
                            base: draft,
                          };
                        })
                      }
                    />
                    <text
                      x={p.x}
                      y={p.y - px(10)}
                      textAnchor="middle"
                      fontSize={px(11)}
                      fontWeight={600}
                      fill="#5A3E91"
                      style={{ pointerEvents: 'none' }}
                    >
                      {p.name}
                    </text>
                  </g>
                );
              })}
              {preview && (
                <polygon
                  points={preview.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="rgba(47,90,242,0.12)"
                  stroke="#2F5AF2"
                  strokeWidth={px(1.5)}
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {poly.length > 0 && (
                <polyline
                  points={[...poly, ...(hover ? [hover.point] : [])]
                    .map((p) => `${p.x},${p.y}`)
                    .join(' ')}
                  fill="rgba(47,90,242,0.10)"
                  stroke="#2F5AF2"
                  strokeWidth={px(1.5)}
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {scalePts.length > 0 && (
                <g style={{ pointerEvents: 'none' }}>
                  <polyline
                    points={[
                      ...scalePts,
                      ...(scalePts.length === 1 && hover ? [hover.point] : []),
                    ]
                      .map((p) => `${p.x},${p.y}`)
                      .join(' ')}
                    fill="none"
                    stroke="#C2412D"
                    strokeWidth={px(2)}
                  />
                  {scalePts.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={px(4)}
                      fill="#C2412D"
                    />
                  ))}
                </g>
              )}
              {hover && tool !== 'select' && tool !== 'pan' && (
                <circle
                  cx={hover.point.x}
                  cy={hover.point.y}
                  r={px(hover.to ? 6 : 3)}
                  fill="none"
                  stroke={
                    hover.to === 'corner'
                      ? '#C2412D'
                      : hover.to
                        ? '#2F5AF2'
                        : '#7A8394'
                  }
                  strokeWidth={px(1.5)}
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </g>
          </svg>
          <div className="plan-hint">
            {busy ?? error ?? hint}
            {draft.scaled && rectStart && hover && !busy && !error && (
              <b>
                {' '}
                {metres(Math.abs(hover.point.x - rectStart.x)).toFixed(
                  1,
                )} × {metres(Math.abs(hover.point.y - rectStart.y)).toFixed(1)}{' '}
                m
              </b>
            )}
          </div>
        </div>
        <aside className="plan-side">
          {tool === 'scale' ? (
            <section>
              <h3>Set the scale</h3>
              <p className="subtle">
                Click the two ends of something you know the length of: a long
                wall, a corridor, a door. Longer is more exact.
              </p>
              {scalePts.length === 2 && (
                <>
                  <div className="field">
                    <label>Real distance between the two points (metres)</label>
                    <input
                      className="input"
                      autoFocus
                      inputMode="decimal"
                      value={scaleMetres}
                      placeholder="12.5"
                      onChange={(e) => setScaleMetres(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && applyScale()}
                    />
                  </div>
                  <button
                    className="btn primary"
                    onClick={applyScale}
                    disabled={!(Number(scaleMetres.replace(',', '.')) > 0)}
                  >
                    Set scale
                  </button>
                </>
              )}
              {draft.scaled && (
                <p className="subtle">
                  Now: the sheet is {metres(draft.width).toFixed(1)} ×{' '}
                  {metres(draft.height).toFixed(1)} m.
                </p>
              )}
            </section>
          ) : room ? (
            <section>
              <h3>
                {room.kind === 'room'
                  ? 'Room'
                  : KINDS.find((k) => k.kind === room.kind)!.label}
              </h3>
              <div className="field">
                <label>Name</label>
                <input
                  className="input"
                  value={room.name}
                  placeholder={
                    room.kind === 'room' ? 'Meeting Room A' : 'Main corridor'
                  }
                  onChange={(e) => patchRoom(room.id, { name: e.target.value })}
                />
              </div>
              <div className="field">
                <label>What it is</label>
                <select
                  className="select"
                  value={room.kind}
                  onChange={(e) =>
                    patchRoom(room.id, {
                      kind: e.target.value as DraftRoomKind,
                    })
                  }
                >
                  {KINDS.map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              {room.kind === 'room' && (
                <div className="field">
                  <label>Category</label>
                  <select
                    className="select"
                    value={room.category ?? ''}
                    onChange={(e) =>
                      patchRoom(room.id, {
                        category: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">From its name</option>
                    {(Object.keys(placeCategories) as PlaceCategory[])
                      .filter((k) => k !== 'circulation' && k !== 'stairs')
                      .map((k) => (
                        <option key={k} value={k}>
                          {placeCategories[k].label}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <p className="subtle">
                {draft.scaled
                  ? `${(polygonAreaUnits(room.points) * draft.metresPerUnit ** 2).toFixed(1)} m²`
                  : 'Set the scale to see its size.'}
                {check.roomsWithoutDoor.includes(room.id) &&
                draft.rooms.length > 1
                  ? ' · No door yet: nobody can be routed here.'
                  : ''}
              </p>
              <button className="btn danger" onClick={removeSelected}>
                Delete room
              </button>
            </section>
          ) : door ? (
            <section>
              <h3>Door</h3>
              <div className="field">
                <label>Width (metres)</label>
                <input
                  className="input"
                  type="number"
                  min={0.5}
                  max={6}
                  step={0.1}
                  value={door.widthMetres ?? 0.9}
                  onChange={(e) =>
                    patchDoor(door.id, {
                      widthMetres: Math.max(
                        0.5,
                        Math.min(6, Number(e.target.value) || 0.9),
                      ),
                    })
                  }
                />
              </div>
              <p className="subtle">
                {check.strayDoors.includes(door.id)
                  ? 'This door is not on a wall. Drag it onto one.'
                  : 'Drag it along the wall to move it. A wide opening is a wide door.'}
              </p>
              <button className="btn danger" onClick={removeSelected}>
                Delete door
              </button>
            </section>
          ) : place ? (
            <section>
              <h3>Place</h3>
              <div className="field">
                <label>Name</label>
                <input
                  className="input"
                  value={place.name}
                  onChange={(e) =>
                    patchPlace(place.id, { name: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>Category</label>
                <select
                  className="select"
                  value={place.category}
                  onChange={(e) =>
                    patchPlace(place.id, { category: e.target.value })
                  }
                >
                  {(Object.keys(placeCategories) as PlaceCategory[])
                    .filter((k) => k !== 'circulation')
                    .map((k) => (
                      <option key={k} value={k}>
                        {placeCategories[k].label}
                      </option>
                    ))}
                </select>
              </div>
              <button className="btn danger" onClick={removeSelected}>
                Delete place
              </button>
            </section>
          ) : (
            <section>
              <h3>Steps</h3>
              <ol className="plan-steps">
                <li className={picture ? 'done' : ''}>
                  Add the plan picture{' '}
                  <span className="subtle">
                    (optional: you can also draw on the empty sheet)
                  </span>
                </li>
                <li className={draft.scaled ? 'done' : ''}>Set the scale</li>
                <li className={draft.rooms.length ? 'done' : ''}>
                  Draw the rooms and the corridor
                  {picture && (
                    <div className="plan-detect">
                      <button
                        className="btn sm primary"
                        disabled={!!busy}
                        onClick={() => void detect()}
                      >
                        Detect rooms
                      </button>
                      <label className="subtle row" style={{ gap: 6 }}>
                        Doors about
                        <input
                          className="input"
                          style={{ width: 62 }}
                          type="number"
                          min={0.6}
                          max={4}
                          step={0.1}
                          value={doorWidth}
                          onChange={(e) =>
                            setDoorWidth(Number(e.target.value) || 1)
                          }
                        />
                        m wide
                      </label>
                    </div>
                  )}
                </li>
                <li className={draft.doors.length ? 'done' : ''}>
                  Put a door on every opening
                </li>
                <li>Name the rooms, then build</li>
              </ol>
              <p className="subtle">
                {draft.rooms.length} rooms · {draft.doors.length} doors ·{' '}
                {draft.places.length} places
              </p>
            </section>
          )}
          <section>
            <h3>Checks</h3>
            {start.lossy && (
              <div className="banner">
                This floor came from an automatic conversion. Building it here
                redraws its walls from the room outlines; free-standing walls
                and windows are not kept.
              </div>
            )}
            {!editing && pkg && floors.some((f) => f.id === slug(label)) && (
              <div className="banner">
                A floor called “
                {floors.find((f) => f.id === slug(label))!.label}” already
                exists. Building replaces it; change the name to add a floor
                instead.
              </div>
            )}
            {!editing &&
              pkg &&
              floors.some((f) => f.level === level && f.id !== slug(label)) && (
                <div className="banner">
                  Level {level} is already used by{' '}
                  {floors.find((f) => f.level === level)!.label}. Give this
                  floor its own level.
                </div>
              )}
            {pkg &&
              floors.length > 0 &&
              !draft.rooms.some((r) => r.kind === 'stairs') && (
                <p className="subtle">
                  To join this floor to the others, draw its stairs or lift as
                  “Stairs or lift” in the same place and with the same name as
                  on the floor above or below.
                </p>
              )}
            {start.restored && (
              <div className="banner info">
                Your unfinished drawing was restored.{' '}
                <button className="btn sm" onClick={startOver}>
                  Start over
                </button>
              </div>
            )}
            {[...check.errors, ...check.warnings].length === 0 ? (
              <p className="subtle">
                Nothing to fix. Build the floor when you are ready.
              </p>
            ) : (
              <ul className="plan-checks">
                {check.errors.map((e) => (
                  <li key={e} className="error">
                    {e}
                  </li>
                ))}
                {check.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>,
    document.body,
  );
}
