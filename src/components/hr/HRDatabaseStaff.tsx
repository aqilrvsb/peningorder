import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  Search,
  CheckCircle2,
  FileEdit,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

interface StaffRecord {
  id: string;
  name: string;
  role: string;
  source: "attendance_staff" | "profiles";
  staffDbId?: string;
  staffDb?: any;
}

const HRDatabaseStaff = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [infoDiri, setInfoDiri] = useState({
    nama: "", jantina: "", umur: "", no_kad_pengenalan: "",
    warganegara: "", bangsa: "", agama: "", status_perkahwinan: "",
    alamat_tetap: "", alamat_surat: "", no_telefon: "",
    jawatan: "", employment_type: "", tarikh_mula_berkhidmat: "",
  });

  const [infoBank, setInfoBank] = useState({
    nama_bank: "", nama_pemilik_bank: "", no_akaun: "", jenis_akaun: "",
  });

  const [infoWaris, setInfoWaris] = useState({
    waris1_nama: "", waris1_hubungan: "", waris1_telefon: "", waris1_alamat: "",
    waris2_nama: "", waris2_hubungan: "", waris2_telefon: "", waris2_alamat: "",
  });

  const [infoAkademik, setInfoAkademik] = useState<Array<{
    nama_kelayakan: string; nama_sekolah: string; tahun: string; keputusan: string;
  }>>([{ nama_kelayakan: "", nama_sekolah: "", tahun: "", keputusan: "" }]);

  // Fetch attendance_staff
  const { data: attendanceStaff = [] } = useQuery({
    queryKey: ["attendance-staff-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_staff")
        .select("id, name, role, is_active")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch profiles (marketer/admin HQ staff)
  const { data: profileStaff = [] } = useQuery({
    queryKey: ["profiles-hr-db"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, full_name, idstaff, is_active, staff_type")
        .eq("is_active", true);
      if (error) throw error;

      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role");

      const roleMap = new Map((roles || []).map((r: any) => [r.user_id, r.role]));

      return (profiles || [])
        .filter((p: any) => {
          const role = roleMap.get(p.id);
          return (role === "marketer" || role === "admin") && p.staff_type !== "Fighter";
        })
        .map((p: any) => ({
          ...p,
          role: roleMap.get(p.id) || "unknown",
        }));
    },
  });

  // Fetch staff_database records
  const { data: staffDbRecords = [], isLoading } = useQuery({
    queryKey: ["staff-database"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_database")
        .select("*");
      if (error) throw error;
      return data || [];
    },
  });

  // Combine all staff
  const allStaff: StaffRecord[] = [
    ...attendanceStaff.map((s: any) => {
      const db = staffDbRecords.find((d: any) => d.staff_id === s.id && d.staff_source === "attendance_staff");
      return { id: s.id, name: s.name, role: s.role, source: "attendance_staff" as const, staffDbId: db?.id, staffDb: db };
    }),
    ...profileStaff.map((p: any) => {
      const db = staffDbRecords.find((d: any) => d.staff_id === p.id && d.staff_source === "profiles");
      return { id: p.id, name: p.full_name, role: p.role, source: "profiles" as const, staffDbId: db?.id, staffDb: db };
    }),
  ];

  // Filter
  const filteredStaff = allStaff.filter((s) => {
    if (search.trim()) {
      return s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.role.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  // Check if section is filled
  const isDiriFilled = (db: any) => db && (db.nama || db.no_kad_pengenalan || db.no_telefon);
  const isBankFilled = (db: any) => db && (db.nama_bank || db.no_akaun);
  const isWarisFilled = (db: any) => db && (db.waris1_nama || db.waris2_nama);
  const isAkademikFilled = (db: any) => db && db.akademik && db.akademik.length > 0 && db.akademik[0]?.nama_kelayakan;

  // Open modal
  const openModal = (staff: StaffRecord, section: string) => {
    setSelectedStaff(staff);
    const db = staff.staffDb || {};

    if (section === "diri") {
      setInfoDiri({
        nama: db.nama || staff.name || "",
        jantina: db.jantina || "",
        umur: db.umur || "",
        no_kad_pengenalan: db.no_kad_pengenalan || "",
        warganegara: db.warganegara || "",
        bangsa: db.bangsa || "",
        agama: db.agama || "",
        status_perkahwinan: db.status_perkahwinan || "",
        alamat_tetap: db.alamat_tetap || "",
        alamat_surat: db.alamat_surat || "",
        no_telefon: db.no_telefon || "",
        jawatan: db.jawatan || staff.role || "",
        employment_type: db.employment_type || "",
        tarikh_mula_berkhidmat: db.tarikh_mula_berkhidmat || "",
      });
    } else if (section === "bank") {
      setInfoBank({
        nama_bank: db.nama_bank || "",
        nama_pemilik_bank: db.nama_pemilik_bank || "",
        no_akaun: db.no_akaun || "",
        jenis_akaun: db.jenis_akaun || "",
      });
    } else if (section === "waris") {
      setInfoWaris({
        waris1_nama: db.waris1_nama || "",
        waris1_hubungan: db.waris1_hubungan || "",
        waris1_telefon: db.waris1_telefon || "",
        waris1_alamat: db.waris1_alamat || "",
        waris2_nama: db.waris2_nama || "",
        waris2_hubungan: db.waris2_hubungan || "",
        waris2_telefon: db.waris2_telefon || "",
        waris2_alamat: db.waris2_alamat || "",
      });
    } else if (section === "akademik") {
      const existing = db.akademik && db.akademik.length > 0
        ? db.akademik
        : [{ nama_kelayakan: "", nama_sekolah: "", tahun: "", keputusan: "" }];
      setInfoAkademik(existing);
    }

    setActiveModal(section);
  };

  // Save handler
  const handleSave = async (section: string) => {
    if (!selectedStaff) return;
    setIsSaving(true);

    try {
      let updateData: any = { updated_at: new Date().toISOString() };

      if (section === "diri") {
        updateData = { ...updateData, ...infoDiri };
      } else if (section === "bank") {
        updateData = { ...updateData, ...infoBank };
      } else if (section === "waris") {
        updateData = { ...updateData, ...infoWaris };
      } else if (section === "akademik") {
        updateData = { ...updateData, akademik: infoAkademik };
      }

      if (selectedStaff.staffDbId) {
        // Update existing
        const { error } = await supabase
          .from("staff_database")
          .update(updateData)
          .eq("id", selectedStaff.staffDbId);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from("staff_database")
          .insert({
            staff_id: selectedStaff.id,
            staff_source: selectedStaff.source,
            ...updateData,
          });
        if (error) throw error;
      }

      toast.success("Saved successfully");
      setActiveModal(null);
      queryClient.invalidateQueries({ queryKey: ["staff-database"] });
    } catch (error: any) {
      toast.error("Failed to save: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Status icon
  const StatusIcon = ({ filled, staff, section }: { filled: boolean; staff: StaffRecord; section: string }) => (
    <button
      onClick={() => openModal(staff, section)}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
        filled
          ? "bg-green-100 text-green-600 hover:bg-green-200"
          : "bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-600"
      }`}
    >
      {filled ? <CheckCircle2 className="w-4 h-4" /> : <FileEdit className="w-4 h-4" />}
    </button>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Database Staff</h1>
        <p className="text-muted-foreground mt-2">
          Manage detailed employee information
        </p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              Total: {filteredStaff.length} staff
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-3 text-left w-12">No</th>
                    <th className="p-3 text-left">Employee</th>
                    <th className="p-3 text-left">Role</th>
                    <th className="p-3 text-center">Info Diri</th>
                    <th className="p-3 text-center">Info Bank</th>
                    <th className="p-3 text-center">Info Waris</th>
                    <th className="p-3 text-center">Info Akademik</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.length > 0 ? (
                    filteredStaff.map((staff, idx) => (
                      <tr key={`${staff.source}-${staff.id}`} className="border-b hover:bg-muted/30">
                        <td className="p-3">{idx + 1}</td>
                        <td className="p-3 font-medium">{staff.name}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            staff.source === "profiles"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-purple-100 text-purple-700"
                          }`}>
                            {staff.role}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <StatusIcon filled={isDiriFilled(staff.staffDb)} staff={staff} section="diri" />
                        </td>
                        <td className="p-3 text-center">
                          <StatusIcon filled={isBankFilled(staff.staffDb)} staff={staff} section="bank" />
                        </td>
                        <td className="p-3 text-center">
                          <StatusIcon filled={isWarisFilled(staff.staffDb)} staff={staff} section="waris" />
                        </td>
                        <td className="p-3 text-center">
                          <StatusIcon filled={isAkademikFilled(staff.staffDb)} staff={staff} section="akademik" />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-muted-foreground">
                        No staff found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Diri Modal */}
      <Dialog open={activeModal === "diri"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Maklumat Diri - {selectedStaff?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nama</Label>
                <Input value={infoDiri.nama} onChange={(e) => setInfoDiri({ ...infoDiri, nama: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Jantina</Label>
                <Select value={infoDiri.jantina} onValueChange={(v) => setInfoDiri({ ...infoDiri, jantina: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Lelaki">Lelaki</SelectItem>
                    <SelectItem value="Perempuan">Perempuan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Umur</Label>
                <Input value={infoDiri.umur} onChange={(e) => setInfoDiri({ ...infoDiri, umur: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>No. Kad Pengenalan</Label>
                <Input value={infoDiri.no_kad_pengenalan} onChange={(e) => setInfoDiri({ ...infoDiri, no_kad_pengenalan: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Warganegara</Label>
                <Input value={infoDiri.warganegara} onChange={(e) => setInfoDiri({ ...infoDiri, warganegara: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Bangsa</Label>
                <Select value={infoDiri.bangsa} onValueChange={(v) => setInfoDiri({ ...infoDiri, bangsa: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Melayu">Melayu</SelectItem>
                    <SelectItem value="Cina">Cina</SelectItem>
                    <SelectItem value="India">India</SelectItem>
                    <SelectItem value="Lain-lain">Lain-lain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Agama</Label>
                <Select value={infoDiri.agama} onValueChange={(v) => setInfoDiri({ ...infoDiri, agama: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Islam">Islam</SelectItem>
                    <SelectItem value="Kristian">Kristian</SelectItem>
                    <SelectItem value="Buddha">Buddha</SelectItem>
                    <SelectItem value="Hindu">Hindu</SelectItem>
                    <SelectItem value="Lain-lain">Lain-lain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status Perkahwinan</Label>
                <Select value={infoDiri.status_perkahwinan} onValueChange={(v) => setInfoDiri({ ...infoDiri, status_perkahwinan: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bujang">Bujang</SelectItem>
                    <SelectItem value="Berkahwin">Berkahwin</SelectItem>
                    <SelectItem value="Duda/Janda">Duda/Janda</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Alamat Tetap</Label>
              <Input value={infoDiri.alamat_tetap} onChange={(e) => setInfoDiri({ ...infoDiri, alamat_tetap: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Alamat Surat Menyurat</Label>
              <Input value={infoDiri.alamat_surat} onChange={(e) => setInfoDiri({ ...infoDiri, alamat_surat: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>No. Telefon</Label>
                <Input value={infoDiri.no_telefon} onChange={(e) => setInfoDiri({ ...infoDiri, no_telefon: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Jawatan</Label>
                <Input value={infoDiri.jawatan} onChange={(e) => setInfoDiri({ ...infoDiri, jawatan: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Employment Type</Label>
                <Select value={infoDiri.employment_type} onValueChange={(v) => setInfoDiri({ ...infoDiri, employment_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Full Time">Full Time</SelectItem>
                    <SelectItem value="Part Time">Part Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tarikh Mula Berkhidmat</Label>
                <Input type="date" value={infoDiri.tarikh_mula_berkhidmat} onChange={(e) => setInfoDiri({ ...infoDiri, tarikh_mula_berkhidmat: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveModal(null)} disabled={isSaving}>Cancel</Button>
            <Button onClick={() => handleSave("diri")} disabled={isSaving}>
              {isSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info Bank Modal */}
      <Dialog open={activeModal === "bank"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Maklumat Perbankan - {selectedStaff?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nama Bank</Label>
              <Input value={infoBank.nama_bank} onChange={(e) => setInfoBank({ ...infoBank, nama_bank: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Nama Pemilik Bank</Label>
              <Input value={infoBank.nama_pemilik_bank} onChange={(e) => setInfoBank({ ...infoBank, nama_pemilik_bank: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>No. Akaun</Label>
              <Input value={infoBank.no_akaun} onChange={(e) => setInfoBank({ ...infoBank, no_akaun: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Jenis Akaun</Label>
              <Select value={infoBank.jenis_akaun} onValueChange={(v) => setInfoBank({ ...infoBank, jenis_akaun: v })}>
                <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Simpanan">Simpanan</SelectItem>
                  <SelectItem value="Semasa">Semasa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveModal(null)} disabled={isSaving}>Cancel</Button>
            <Button onClick={() => handleSave("bank")} disabled={isSaving}>
              {isSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info Waris Modal */}
      <Dialog open={activeModal === "waris"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Maklumat Waris - {selectedStaff?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-sm mb-3">Waris 1</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nama</Label>
                    <Input value={infoWaris.waris1_nama} onChange={(e) => setInfoWaris({ ...infoWaris, waris1_nama: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Hubungan</Label>
                    <Input value={infoWaris.waris1_hubungan} onChange={(e) => setInfoWaris({ ...infoWaris, waris1_hubungan: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>No. Telefon</Label>
                    <Input value={infoWaris.waris1_telefon} onChange={(e) => setInfoWaris({ ...infoWaris, waris1_telefon: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Alamat</Label>
                    <Input value={infoWaris.waris1_alamat} onChange={(e) => setInfoWaris({ ...infoWaris, waris1_alamat: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>

            <hr />

            <div>
              <h3 className="font-semibold text-sm mb-3">Waris 2</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nama</Label>
                    <Input value={infoWaris.waris2_nama} onChange={(e) => setInfoWaris({ ...infoWaris, waris2_nama: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Hubungan</Label>
                    <Input value={infoWaris.waris2_hubungan} onChange={(e) => setInfoWaris({ ...infoWaris, waris2_hubungan: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>No. Telefon</Label>
                    <Input value={infoWaris.waris2_telefon} onChange={(e) => setInfoWaris({ ...infoWaris, waris2_telefon: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Alamat</Label>
                    <Input value={infoWaris.waris2_alamat} onChange={(e) => setInfoWaris({ ...infoWaris, waris2_alamat: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveModal(null)} disabled={isSaving}>Cancel</Button>
            <Button onClick={() => handleSave("waris")} disabled={isSaving}>
              {isSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info Akademik Modal */}
      <Dialog open={activeModal === "akademik"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Maklumat Akademik - {selectedStaff?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {infoAkademik.map((item, idx) => (
              <div key={idx} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">Kelayakan {idx + 1}</h4>
                  {infoAkademik.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setInfoAkademik(infoAkademik.filter((_, i) => i !== idx))}
                      className="h-7 px-2 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Nama Kelayakan/Bidang</Label>
                    <Input
                      value={item.nama_kelayakan}
                      onChange={(e) => {
                        const updated = [...infoAkademik];
                        updated[idx] = { ...updated[idx], nama_kelayakan: e.target.value };
                        setInfoAkademik(updated);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nama Sekolah/Institusi</Label>
                    <Input
                      value={item.nama_sekolah}
                      onChange={(e) => {
                        const updated = [...infoAkademik];
                        updated[idx] = { ...updated[idx], nama_sekolah: e.target.value };
                        setInfoAkademik(updated);
                      }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Tahun</Label>
                    <Input
                      value={item.tahun}
                      onChange={(e) => {
                        const updated = [...infoAkademik];
                        updated[idx] = { ...updated[idx], tahun: e.target.value };
                        setInfoAkademik(updated);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Keputusan Pangkat</Label>
                    <Input
                      value={item.keputusan}
                      onChange={(e) => {
                        const updated = [...infoAkademik];
                        updated[idx] = { ...updated[idx], keputusan: e.target.value };
                        setInfoAkademik(updated);
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => setInfoAkademik([...infoAkademik, { nama_kelayakan: "", nama_sekolah: "", tahun: "", keputusan: "" }])}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" /> Tambah Kelayakan
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveModal(null)} disabled={isSaving}>Cancel</Button>
            <Button onClick={() => handleSave("akademik")} disabled={isSaving}>
              {isSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HRDatabaseStaff;
