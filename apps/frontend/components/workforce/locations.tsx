'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MapPin, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useWorkforce } from '@/lib/workforce/client';
import { bogotaDate } from '@/lib/workforce/dates';
import type { Site } from '@/lib/workforce/types';
import {
  useWorkforceNow,
  canAdmin,
  DataState,
  Empty,
  errorMessage,
  Field,
  Modal,
  Notice,
  tableClass,
  WorkforceShell,
} from './shared';

export default function LocationsPage() {
  const today = bogotaDate(useWorkforceNow());
  const api = useWorkforce(today, today);
  const [editing, setEditing] = useState<Site | 'new' | null>(null);
  useEffect(() => {
    setEditing(null);
  }, [api.companyId]);
  return (
    <WorkforceShell
      title="Sedes de marcación"
      description="Define dónde puede marcar cada grupo y la calidad mínima de su ubicación GPS."
      data={api.data}
      actions={
        api.data &&
        canAdmin(api.data) && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" />
            Crear sede
          </Button>
        )
      }
    >
      <DataState loading={api.isLoading} error={api.error} companyId={api.companyId} retry={api.refresh}>
        {api.data && (
          <>
            <Notice>
              Asigna las sedes a sus grupos desde Programación → Grupos. El radio y la tolerancia se verifican en cada
              marcación.
            </Notice>
            <div className="mt-4 overflow-x-auto rounded-lg border">
              {!api.data.sites.length ? (
                <Empty
                  title="Aún no hay sedes"
                  description="Crea la primera ubicación para habilitar la marcación GPS del equipo."
                />
              ) : (
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th>Sede</th>
                      <th>Coordenadas</th>
                      <th>Radio + tolerancia</th>
                      <th>Precisión máxima</th>
                      <th>Antigüedad máxima</th>
                      <th>Estado</th>
                      <th>
                        <span className="sr-only">Editar</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {api.data.sites.map((site) => (
                      <tr key={site.id}>
                        <td>
                          <span className="flex items-center gap-2 font-medium">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            {site.name}
                          </span>
                        </td>
                        <td className="tabular-nums">
                          {site.latitude.toFixed(5)}, {site.longitude.toFixed(5)}
                        </td>
                        <td>
                          {site.radius} m + {site.tolerance} m
                        </td>
                        <td>{site.maxAccuracy} m</td>
                        <td>{site.maxAgeSeconds} s</td>
                        <td>
                          <Badge variant={site.active ? 'secondary' : 'outline'}>
                            {site.active ? 'Activa' : 'Inactiva'}
                          </Badge>
                        </td>
                        <td>
                          {canAdmin(api.data!) && (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Editar ${site.name}`}
                              onClick={() => setEditing(site)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {editing && (
              <SiteForm
                key={`${api.companyId}:${editing === 'new' ? 'new' : editing.id}`}
                site={editing === 'new' ? undefined : editing}
                api={api}
                onClose={() => setEditing(null)}
              />
            )}
          </>
        )}
      </DataState>
    </WorkforceShell>
  );
}
function SiteForm({ site, api, onClose }: { site?: Site; api: ReturnType<typeof useWorkforce>; onClose: () => void }) {
  const [draft, setDraft] = useState({
    name: site?.name ?? '',
    latitude: site?.latitude ?? 4.711,
    longitude: site?.longitude ?? -74.0721,
    radius: site?.radius ?? 150,
    tolerance: site?.tolerance ?? 30,
    maxAccuracy: site?.maxAccuracy ?? 100,
    maxAgeSeconds: site?.maxAgeSeconds ?? 60,
    active: site?.active ?? true,
  });
  const [error, setError] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.execute({ type: 'saveSite', site: { ...draft, id: site?.id }, expectedRevision: site?.revision ?? 0 });
      toast.success('Sede guardada');
      onClose();
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={site ? 'Editar sede' : 'Crear sede'}
      description="Busca una dirección, elige un punto en el mapa o ingresa sus coordenadas."
      wide
    >
      <form onSubmit={save} className="space-y-4">
        {error && <Notice danger>{error}</Notice>}
        <Field label="Nombre de la sede">
          <Input
            required
            maxLength={120}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <GoogleLocationPicker
          latitude={draft.latitude}
          longitude={draft.longitude}
          onPick={(latitude, longitude) => setDraft((current) => ({ ...current, latitude, longitude }))}
        />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Latitud">
            <Input
              required
              type="number"
              step="any"
              min="-90"
              max="90"
              value={draft.latitude}
              onChange={(e) => setDraft({ ...draft, latitude: Number(e.target.value) })}
            />
          </Field>
          <Field label="Longitud">
            <Input
              required
              type="number"
              step="any"
              min="-180"
              max="180"
              value={draft.longitude}
              onChange={(e) => setDraft({ ...draft, longitude: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(
            [
              ['radius', 'Radio (m)', 1, 5000],
              ['tolerance', 'Tolerancia (m)', 0, 100],
              ['maxAccuracy', 'Precisión máx. (m)', 1, 100],
              ['maxAgeSeconds', 'Antigüedad máx. (s)', 1, 60],
            ] as const
          ).map(([field, label, min, max]) => (
            <Field key={field} label={label}>
              <Input
                required
                type="number"
                min={min}
                max={max}
                value={draft[field]}
                onChange={(e) => setDraft({ ...draft, [field]: Number(e.target.value) })}
              />
            </Field>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          />
          Sede activa
        </label>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={api.isPending}>
            {api.isPending ? 'Guardando…' : 'Guardar sede'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
type LatLng = { lat: () => number; lng: () => number };
type MapHandle = {
  setCenter: (p: { lat: number; lng: number }) => void;
  addListener: (name: string, fn: (event: { latLng?: LatLng }) => void) => { remove: () => void };
};
type MarkerHandle = { setPosition: (p: { lat: number; lng: number }) => void; setMap: (map: MapHandle | null) => void };
type MapsApi = {
  importLibrary: (name: string) => Promise<unknown>;
  Map: new (element: HTMLElement, options: object) => MapHandle;
  Marker: new (options: object) => MarkerHandle;
  places?: {
    PlaceAutocompleteElement: new (options?: object) => HTMLElement;
  };
};
type PlaceSelectionEvent = Event & {
  placePrediction: {
    toPlace: () => { location?: LatLng; fetchFields: (options: { fields: string[] }) => Promise<unknown> };
  };
};
function googleMaps() {
  return (window as unknown as { google?: { maps?: MapsApi } }).google?.maps;
}
function GoogleLocationPicker({
  latitude,
  longitude,
  onPick,
}: {
  latitude: number;
  longitude: number;
  onPick: (lat: number, lng: number) => void;
}) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const mapElement = useRef<HTMLDivElement>(null);
  const searchElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapHandle | null>(null);
  const markerRef = useRef<MarkerHandle | null>(null);
  const onPickRef = useRef(onPick);
  const initial = useRef({ lat: latitude, lng: longitude });
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const load = async () => {
      try {
        const maps = googleMaps();
        if (!maps) throw new Error('Maps unavailable');
        await Promise.all([maps.importLibrary('maps'), maps.importLibrary('places')]);
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    if (googleMaps()) {
      void load();
      return () => {
        cancelled = true;
      };
    }
    let script = document.getElementById('workforce-google-maps') as HTMLScriptElement | null;
    const error = () => setFailed(true);
    if (!script) {
      script = document.createElement('script');
      script.id = 'workforce-google-maps';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async`;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', load);
    script.addEventListener('error', error);
    return () => {
      cancelled = true;
      script?.removeEventListener('load', load);
      script?.removeEventListener('error', error);
    };
  }, [key]);
  useEffect(() => {
    const maps = googleMaps();
    if (!ready || !maps || !mapElement.current) return;
    const map = new maps.Map(mapElement.current, {
      center: initial.current,
      zoom: 16,
      streetViewControl: false,
      mapTypeControl: false,
    });
    const marker = new maps.Marker({ position: initial.current, map });
    mapRef.current = map;
    markerRef.current = marker;
    const listener = map.addListener('click', (event) => {
      if (event.latLng) onPickRef.current(event.latLng.lat(), event.latLng.lng());
    });
    let picker: HTMLElement | undefined;
    const selectPlace = async (event: Event) => {
      try {
        const place = (event as PlaceSelectionEvent).placePrediction.toPlace();
        await place.fetchFields({ fields: ['location'] });
        if (place.location) {
          onPickRef.current(place.location.lat(), place.location.lng());
          map.setCenter({ lat: place.location.lat(), lng: place.location.lng() });
        }
      } catch {
        setFailed(true);
      }
    };
    if (maps.places && searchElement.current) {
      picker = new maps.places.PlaceAutocompleteElement({ includedRegionCodes: ['co'] });
      picker.setAttribute('aria-label', 'Buscar dirección o lugar en Colombia');
      picker.style.width = '100%';
      searchElement.current.appendChild(picker);
      picker.addEventListener('gmp-select', selectPlace);
      picker.addEventListener('gmp-error', () => setFailed(true));
    }
    return () => {
      listener.remove();
      picker?.removeEventListener('gmp-select', selectPlace);
      picker?.remove();
      marker.setMap(null);
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [ready]);
  useEffect(() => {
    markerRef.current?.setPosition({ lat: latitude, lng: longitude });
    mapRef.current?.setCenter({ lat: latitude, lng: longitude });
  }, [latitude, longitude]);
  if (!key || failed)
    return (
      <Notice>
        El mapa no está disponible. Puedes configurar la sede con coordenadas manuales.
        {failed && ' No se pudo cargar Google Maps.'}
      </Notice>
    );
  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Buscar dirección en Google Maps</p>
        <div ref={searchElement} />
      </div>
      <div
        ref={mapElement}
        className="h-64 overflow-hidden rounded-lg border bg-muted"
        aria-label="Mapa para seleccionar la sede"
      />
      {!ready && <p className="text-xs text-muted-foreground">Cargando mapa…</p>}
      <p className="text-xs text-muted-foreground">Haz clic en el mapa para colocar el punto de marcación.</p>
    </div>
  );
}
