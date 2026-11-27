import fs from 'node:fs';
import path from 'node:path';
import { GameRoomState } from '../shared/types.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'lobbies.json');
const SAVES_DIR = path.join(DATA_DIR, 'saves');

export class RoomStore {
  private rooms = new Map<string, GameRoomState>();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(STORE_FILE)) return;
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, GameRoomState>;
      const cutoff = Date.now() - 1000 * 60 * 60 * 96;
      for (const [code, room] of Object.entries(parsed)) {
        if (
          room.schemaVersion === 5 &&
          room.createdAt >= cutoff &&
          room.countries?.IR?.relations &&
          room.minorNations
        ) {
          for (const p of room.players) p.connected = false;
          for (const c of Object.values(room.countries)) c.isOnline = false;
          this.rooms.set(code, room);
        }
      }
    } catch (err) {
      console.warn('Could not load saved lobbies, starting fresh:', err);
    }
  }

  public get(code: string): GameRoomState | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  public set(code: string, state: GameRoomState): void {
    this.rooms.set(code.toUpperCase(), state);
    this.scheduleSave();
  }

  public delete(code: string): void {
    this.rooms.delete(code.toUpperCase());
    this.scheduleSave();
  }

  public values(): IterableIterator<GameRoomState> {
    return this.rooms.values();
  }

  public savePermanentSnapshot(room: GameRoomState): string {
    try {
      if (!fs.existsSync(SAVES_DIR)) {
        fs.mkdirSync(SAVES_DIR, { recursive: true });
      }
      const cleanCode = `SV-${room.roomCode}-${room.round}`;
      const filePath = path.join(SAVES_DIR, `${cleanCode}.json`);
      fs.writeFileSync(filePath, JSON.stringify(room), 'utf-8');
      return cleanCode;
    } catch (err) {
      console.warn('Failed to write snapshot:', err);
      return `SV-${room.roomCode}`;
    }
  }

  public loadPermanentSnapshot(saveCode: string): GameRoomState | null {
    try {
      const safe = saveCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
      const filePath = path.join(SAVES_DIR, `${safe}.json`);
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as GameRoomState;
      if (parsed.schemaVersion !== 5 || !parsed.countries?.IR) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  public scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flushNow();
    }, 800);
  }

  public flushNow(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const obj: Record<string, GameRoomState> = {};
      for (const [k, v] of this.rooms.entries()) {
        obj[k] = v;
      }
      const tmpFile = `${STORE_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(obj), 'utf-8');
      fs.renameSync(tmpFile, STORE_FILE);
    } catch (err) {
      console.warn('Failed to persist lobbies:', err);
    }
  }
}
