import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type PlacementStatusModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStatus: string | null;
  leadName: string;
  onSave: (newStatus: string) => Promise<void>;
};

const placementStatusOptions = [
  "Good Standing",
  "Not Placed",
  "Pending Failed Payment Fix",
  "FDPF Pending Reason",
  "FDPF Insufficient Funds",
  "FDPF Incorrect Banking Info",
  "FDPF Unauthorized Draft"
];

export const PlacementStatusModal = ({
  open,
  onOpenChange,
  currentStatus,
  leadName,
  onSave,
}: PlacementStatusModalProps) => {
  const [selectedStatus, setSelectedStatus] = useState<string>(currentStatus || "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedStatus) return;
    
    setIsSaving(true);
    try {
      await onSave(selectedStatus);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving placement status:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Placement Status</DialogTitle>
          <DialogDescription>
            Update the placement status for <strong>{leadName}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="placement-status">Placement Status</Label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger id="placement-status">
                <SelectValue placeholder="Select placement status" />
              </SelectTrigger>
              <SelectContent>
                {placementStatusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedStatus || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
