import React, { useEffect, useState } from 'react';
import { Text, View, ScrollView, Pressable, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { api, API_URL } from '@/src/api/client';
import { uploadForm } from '@/src/utils/upload';
import { shareFile } from '@/src/utils/shareFile';
import MeshPreview from '@/src/components/MeshPreview';
import { colors } from '@/src/theme/colors';

type Mesh = { mesh_id: string; name: string; preview: number[][][]; triangles: number; dimensions: number[]; watertight: boolean };
export default function MeshStudio() {
  const router = useRouter();
  const [mesh, setMesh] = useState<Mesh | null>(null);
  const [history, setHistory] = useState<Mesh[]>([]);
  const [saved, setSaved] = useState<any[]>([]);
  const [scale, setScale] = useState('1');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [rotation, setRotation] = useState('90');
  const [axis, setAxis] = useState('z');
  const headers = async () => ({ Authorization: `Bearer ${await api.getToken()}` });
  const call = async (path: string, body?: unknown) => {
    const response = await fetch(API_URL + path, { method: body ? 'POST' : 'GET', headers: { ...await headers(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json(); if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Mesh operation failed.'); return data;
  };
  const run = async (work: () => Promise<Mesh>) => {
    if (busy) return; setBusy(true); setMessage('');
    try { const result = await work(); if (mesh) setHistory((items) => [...items, mesh]); setMesh(result); setSaved(await call('/cad/meshes')); }
    catch (e: any) { setMessage(e.message); } finally { setBusy(false); }
  };
  useEffect(() => { void call('/cad/meshes').then(setSaved).catch((e) => setMessage(e.message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pickMesh = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.name.toLowerCase().endsWith('.stl')) { setMessage('Choose an ASCII or binary .stl file.'); return; }
      const auth = await headers();
      await run(() => uploadForm<Mesh>(API_URL + '/cad/import', { headers: auth, files: { file: { uri: asset.uri, name: asset.name, mimeType: 'model/stl' } } }));
    } catch (e: any) { setMessage(e.message); }
  };
  const exportMesh = async () => {
    if (!mesh) return; setBusy(true);
    try { const response = await fetch(`${API_URL}/cad/meshes/${mesh.mesh_id}/export`, { headers: await headers() }); if (!response.ok) throw new Error('Export could not be retrieved.'); await shareFile(new Uint8Array(await response.arrayBuffer()), 'aiforge-model.stl', 'model/stl'); setMessage('STL export prepared with the saved geometry.'); }
    catch (e: any) { setMessage(e.message); } finally { setBusy(false); }
  };
  return <SafeAreaView style={s.root}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Pressable testID="mesh-back" style={s.button} onPress={() => router.back()}><Text style={s.link}>Back</Text></Pressable>
    <Text style={s.title} testID="mesh-title">STL Mesh Studio</Text><Text style={s.body}>Import real geometry, scale and rotate it, then export a new STL. No AI credits. Originals stay unchanged.</Text>
    <Pressable testID="mesh-import" style={s.primary} disabled={busy} onPress={pickMesh}><Text style={s.primaryText}>Import STL · up to 10 MB</Text></Pressable>
    <View style={s.row}>{['box', 'sphere', 'cylinder'].map((shape) => <Pressable testID={`mesh-new-${shape}`} key={shape} style={s.chip} disabled={busy} onPress={() => run(() => call('/cad/primitive', { shape, size_mm: 20 }))}><Text style={s.link}>New {shape}</Text></Pressable>)}</View>
    {busy && <ActivityIndicator testID="mesh-processing" color={colors.cyan} />}
    {!!message && <Text testID="mesh-message" style={s.warning}>{message}</Text>}
    {mesh && <>
      <MeshPreview triangles={mesh.preview} />
      <Text testID="mesh-dimensions" style={s.label}>{mesh.dimensions.map((v) => v.toFixed(2)).join(' × ')} mm</Text>
      <Text testID="mesh-quality" style={s.body}>{mesh.triangles.toLocaleString()} triangles · {mesh.watertight ? 'Watertight mesh' : 'Open/non-watertight mesh — repair before printing'}</Text>
      <Text style={s.body}>STL does not encode units; coordinates are interpreted as millimetres. Always inspect the exported mesh in your slicer.</Text>
      <View style={s.row}><Text style={s.label}>Scale factor</Text><TextInput testID="mesh-scale" style={s.input} value={scale} onChangeText={setScale} keyboardType="decimal-pad" /></View>
      <View style={s.row}>{['x', 'y', 'z'].map((a) => <Pressable key={a} testID={`mesh-axis-${a}`} style={[s.chip, a === axis && s.active]} onPress={() => setAxis(a)}><Text style={s.link}>{a.toUpperCase()} axis</Text></Pressable>)}</View>
      <View style={s.row}><Text style={s.label}>Rotation °</Text><TextInput testID="mesh-rotation" style={s.input} value={rotation} onChangeText={setRotation} keyboardType="numbers-and-punctuation" /></View>
      <Pressable testID="mesh-apply-transform" disabled={busy} style={s.primary} onPress={() => run(() => call(`/cad/meshes/${mesh.mesh_id}/transform`, { scale: Number(scale), [`rotate_${axis}`]: Number(rotation), center: true }))}><Text style={s.primaryText}>Apply & save a copy</Text></Pressable>
      <View style={s.row}><Pressable testID="mesh-undo" disabled={!history.length || busy} style={s.button} onPress={() => { setMesh(history[history.length - 1]); setHistory(history.slice(0, -1)); }}><Text style={s.link}>Undo</Text></Pressable><Pressable testID="mesh-export" disabled={busy} style={s.button} onPress={exportMesh}><Text style={s.link}>Export STL</Text></Pressable></View>
    </>}
    <Text style={s.label}>Saved meshes</Text>
    {!saved.length && <Text testID="mesh-empty" style={s.body}>Your imported and edited files will appear here.</Text>}
    {saved.map((item) => <Pressable key={item.mesh_id} testID={`mesh-open-${item.mesh_id}`} style={s.saved} disabled={busy} onPress={() => run(() => call(`/cad/meshes/${item.mesh_id}`))}><Text style={s.label}>{item.name}</Text><Text style={s.body}>{item.summary.triangles.toLocaleString()} triangles</Text></Pressable>)}
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.bg }, content: { padding: 24, gap: 22, paddingBottom: 64 }, title: { fontSize: 30, fontWeight: '800', color: colors.text }, body: { fontSize: 14, lineHeight: 22, color: colors.textDim }, label: { color: colors.text, fontSize: 17, fontWeight: '700' }, link: { color: colors.cyan, fontSize: 14 }, button: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 5 }, primary: { minHeight: 52, borderRadius: 16, backgroundColor: colors.cyan, alignItems: 'center', justifyContent: 'center', padding: 14 }, primaryText: { color: colors.bg, fontSize: 15, fontWeight: '800' }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, chip: { padding: 12, minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 20 }, active: { borderColor: colors.cyan }, input: { padding: 14, minHeight: 48, minWidth: 110, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 14, color: colors.text }, warning: { color: colors.yellow, fontSize: 14, lineHeight: 22 }, saved: { padding: 18, borderRadius: 16, backgroundColor: colors.surface, gap: 8 } });