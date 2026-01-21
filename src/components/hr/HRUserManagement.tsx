import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Users, UserCheck, UserX, Plus, Loader2, Pencil, Trash2, Search } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  idstaff: string | null;
  is_active: boolean;
  whatsapp_number: string | null;
  created_at: string;
  role?: string;
  staff_type?: string;
}

const HRUserManagement = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    username: "",
    full_name: "",
    idstaff: "",
    password: "",
    whatsapp_number: "",
    role: "marketer",
    staff_type: "HQ",
    is_active: true,
  });

  // Fetch all users with their roles
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["hr-users"],
    queryFn: async () => {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch user_roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Create a map of user_id to role
      const rolesMap = new Map(roles?.map((r: any) => [r.user_id, r.role]) || []);

      // Merge profiles with roles and filter only marketers and admins
      return (profiles || [])
        .map((profile: any) => ({
          ...profile,
          role: rolesMap.get(profile.id) || "unknown",
        }))
        .filter((u: UserProfile) => u.role === "marketer" || u.role === "admin");
    },
  });

  // Filter users based on search and filters
  const filteredUsers = users.filter((user: UserProfile) => {
    const matchesSearch =
      searchQuery === "" ||
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.idstaff?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && user.is_active) ||
      (statusFilter === "inactive" && !user.is_active);

    return matchesSearch && matchesRole && matchesStatus;
  });

  // Calculate statistics
  const totalMarketers = users.filter((u: UserProfile) => u.role === "marketer").length;
  const totalAdmins = users.filter((u: UserProfile) => u.role === "admin").length;
  const activeMarketers = users.filter((u: UserProfile) => u.role === "marketer" && u.is_active).length;
  const activeAdmins = users.filter((u: UserProfile) => u.role === "admin" && u.is_active).length;

  const stats = [
    { title: "Total Marketer", value: totalMarketers, icon: Users, color: "text-blue-600", bgColor: "bg-blue-50" },
    { title: "Total Admin", value: totalAdmins, icon: Users, color: "text-purple-600", bgColor: "bg-purple-50" },
    { title: "Active Marketer", value: activeMarketers, icon: UserCheck, color: "text-green-600", bgColor: "bg-green-50" },
    { title: "Active Admin", value: activeAdmins, icon: UserCheck, color: "text-emerald-600", bgColor: "bg-emerald-50" },
  ];

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Hash the password (simple hash for demo - in production use bcrypt on server)
      const passwordHash = data.password; // In production, hash this properly

      // Create profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .insert({
          username: data.username,
          full_name: data.full_name,
          idstaff: data.idstaff || null,
          password_hash: passwordHash,
          whatsapp_number: data.whatsapp_number || null,
          staff_type: data.staff_type || "HQ",
          is_active: data.is_active,
        })
        .select()
        .single();

      if (profileError) throw profileError;

      // Create user_role
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: profile.id,
          role: data.role,
        });

      if (roleError) throw roleError;

      return profile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-users"] });
      toast.success("User created successfully");
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create user");
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<typeof formData> }) => {
      const updateData: any = {
        full_name: data.updates.full_name,
        idstaff: data.updates.idstaff || null,
        whatsapp_number: data.updates.whatsapp_number || null,
        staff_type: data.updates.staff_type || "HQ",
        is_active: data.updates.is_active,
        updated_at: new Date().toISOString(),
      };

      // Only update password if provided
      if (data.updates.password) {
        updateData.password_hash = data.updates.password;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", data.id);

      if (profileError) throw profileError;

      // Update role if changed
      if (data.updates.role) {
        const { error: roleError } = await supabase
          .from("user_roles")
          .update({ role: data.updates.role })
          .eq("user_id", data.id);

        if (roleError) throw roleError;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-users"] });
      toast.success("User updated successfully");
      setIsEditDialogOpen(false);
      setSelectedUser(null);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update user");
    },
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async (data: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: data.is_active, updated_at: new Date().toISOString() })
        .eq("id", data.id);

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["hr-users"] });
      toast.success(`User ${data.is_active ? "activated" : "deactivated"} successfully`);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update user status");
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      // Delete user_role first
      const { error: roleError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", id);

      if (roleError) throw roleError;

      // Delete profile
      const { error: profileError } = await supabase
        .from("profiles")
        .delete()
        .eq("id", id);

      if (profileError) throw profileError;

      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-users"] });
      toast.success("User deleted successfully");
      setIsDeleteDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete user");
    },
  });

  const resetForm = () => {
    setFormData({
      username: "",
      full_name: "",
      idstaff: "",
      password: "",
      whatsapp_number: "",
      role: "marketer",
      staff_type: "HQ",
      is_active: true,
    });
  };

  const handleCreate = () => {
    if (!formData.username || !formData.full_name || !formData.password) {
      toast.error("Please fill in required fields (Username, Full Name, Password)");
      return;
    }
    createUserMutation.mutate(formData);
  };

  const handleEdit = (user: UserProfile) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      full_name: user.full_name,
      idstaff: user.idstaff || "",
      password: "",
      whatsapp_number: user.whatsapp_number || "",
      role: user.role || "marketer",
      staff_type: user.staff_type || "HQ",
      is_active: user.is_active,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedUser) return;
    if (!formData.full_name) {
      toast.error("Full Name is required");
      return;
    }
    updateUserMutation.mutate({
      id: selectedUser.id,
      updates: formData,
    });
  };

  const handleDelete = (user: UserProfile) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!selectedUser) return;
    deleteUserMutation.mutate(selectedUser.id);
  };

  const handleToggleActive = (user: UserProfile, checked: boolean) => {
    toggleActiveMutation.mutate({ id: user.id, is_active: checked });
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "marketer":
        return "bg-blue-100 text-blue-800";
      case "admin":
        return "bg-purple-100 text-purple-800";
      case "logistic":
        return "bg-orange-100 text-orange-800";
      case "account":
        return "bg-green-100 text-green-800";
      case "bod":
        return "bg-red-100 text-red-800";
      case "hr":
        return "bg-pink-100 text-pink-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-muted-foreground text-sm">
            Manage marketers and admins
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
                <div className={`p-2 rounded-full ${stat.bgColor}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters and Table */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, username, ID staff..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="marketer">Marketer</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">No</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Full Name</TableHead>
                    <TableHead>ID Staff</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-center">Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((user: UserProfile, index: number) => (
                      <TableRow key={user.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell>{user.full_name}</TableCell>
                        <TableCell>{user.idstaff || "-"}</TableCell>
                        <TableCell>{user.whatsapp_number || "-"}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(user.role || "")}`}>
                            {user.role || "unknown"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${user.staff_type === 'Fighter' ? 'bg-orange-100 text-orange-800' : 'bg-teal-100 text-teal-800'}`}>
                            {user.staff_type || "HQ"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={user.is_active}
                            onCheckedChange={(checked) => handleToggleActive(user, checked)}
                            disabled={toggleActiveMutation.isPending}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(user)}
                            >
                              <Pencil className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(user)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                        No users found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="Enter username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="idstaff">ID Staff</Label>
                <Input
                  id="idstaff"
                  value={formData.idstaff}
                  onChange={(e) => setFormData({ ...formData, idstaff: e.target.value })}
                  placeholder="Enter ID staff"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name *</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="Enter full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Enter password"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp Number</Label>
                <Input
                  id="whatsapp"
                  value={formData.whatsapp_number}
                  onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
                  placeholder="e.g. 60123456789"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="marketer">Marketer</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="staff_type">Type *</Label>
                <Select value={formData.staff_type} onValueChange={(v) => setFormData({ ...formData, staff_type: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HQ">HQ</SelectItem>
                    <SelectItem value="Fighter">Fighter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2 pt-8">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreateDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createUserMutation.isPending}>
              {createUserMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-username">Username</Label>
                <Input
                  id="edit-username"
                  value={formData.username}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-idstaff">ID Staff</Label>
                <Input
                  id="edit-idstaff"
                  value={formData.idstaff}
                  onChange={(e) => setFormData({ ...formData, idstaff: e.target.value })}
                  placeholder="Enter ID staff"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-full_name">Full Name *</Label>
              <Input
                id="edit-full_name"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="Enter full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-password">New Password (leave blank to keep current)</Label>
              <Input
                id="edit-password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Enter new password"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-whatsapp">WhatsApp Number</Label>
                <Input
                  id="edit-whatsapp"
                  value={formData.whatsapp_number}
                  onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
                  placeholder="e.g. 60123456789"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-role">Role *</Label>
                <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="marketer">Marketer</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-staff_type">Type *</Label>
                <Select value={formData.staff_type} onValueChange={(v) => setFormData({ ...formData, staff_type: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HQ">HQ</SelectItem>
                    <SelectItem value="Fighter">Fighter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2 pt-8">
                <Switch
                  id="edit-is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="edit-is_active">Active</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditDialogOpen(false); setSelectedUser(null); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateUserMutation.isPending}>
              {updateUserMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{selectedUser?.full_name}</strong>?
              <br />
              <span className="text-red-600">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedUser(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default HRUserManagement;
