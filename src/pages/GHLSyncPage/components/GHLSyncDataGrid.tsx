import { useState } from 'react';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Zap, Eye } from 'lucide-react';
import { GHLSyncRow } from '../GHLSyncPage';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface GHLSyncDataGridProps {
  data: GHLSyncRow[];
  onDataUpdate: () => void;
  hasWritePermissions?: boolean;
  currentPage?: number;
  totalRecords?: number;
  recordsPerPage?: number;
  onPageChange?: (page: number) => void;
}

export const GHLSyncDataGrid = ({
  data,
  onDataUpdate,
  hasWritePermissions = true,
  currentPage = 1,
  totalRecords = 0,
  recordsPerPage = 50,
  onPageChange
}: GHLSyncDataGridProps) => {
  const [syncingRows, setSyncingRows] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const columns = [
    "S.No", "Date", "Lead Vendor", "Insured Name", "Phone Number", "Agent", "Status", "Carrier", "Face Amount", "Notes"
  ];

  // Add Actions column only for users with write permissions
  if (hasWritePermissions) {
    columns.push("Actions");
  }

  // Calculate pagination based on server-side data
  const totalPages = Math.ceil(totalRecords / recordsPerPage);
  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = startIndex + data.length;

  // Pagination handlers
  const goToFirstPage = () => onPageChange?.(1);
  const goToLastPage = () => onPageChange?.(totalPages);
  const goToNextPage = () => onPageChange?.(Math.min(currentPage + 1, totalPages));
  const goToPrevPage = () => onPageChange?.(Math.max(currentPage - 1, 1));

  // Handle individual sync to GHL
  const handleSyncToGHL = async (row: GHLSyncRow) => {
    if (!hasWritePermissions) return;

    setSyncingRows(prev => new Set(prev).add(row.id));

    try {
      // Check if we have the required GHL data
      const locationId = row.ghl_location_id || row.ghllocationid;
      const opportunityId = row.ghl_opportunity_id || row.ghlopportunityid;

      if (!locationId || !opportunityId) {
        toast({
          title: "Missing GHL Data",
          description: `No GHL location or opportunity ID found for ${row.insured_name || 'Unknown'}`,
          variant: "destructive",
        });
        return;
      }

      // Get API token for this location
      const { data: locationSecret, error: secretError } = await supabase
        .from('ghl_location_secrets')
        .select('api_token')
        .eq('locationid', locationId)
        .single();

      if (secretError || !locationSecret) {
        console.error('Error fetching GHL token:', secretError);
        toast({
          title: "Configuration Error",
          description: `No API token found for location ${locationId}`,
          variant: "destructive",
        });
        return;
      }

      // Get stage mappings for this location
      const { data: stageMappings, error: mappingError } = await supabase
        .from('ghl_stage_mappings')
        .select('*')
        .eq('locationid', locationId)
        .single();

      if (mappingError || !stageMappings) {
        console.error('Error fetching stage mappings:', mappingError);
        toast({
          title: "Configuration Error",
          description: `No stage mappings found for location ${locationId}`,
          variant: "destructive",
        });
        return;
      }

      // Map status to pipeline stage ID
      const statusToStageMap: Record<string, string> = {
        'Pending Approval': stageMappings.pending_approval,
        'Needs BPO Callback': stageMappings.needs_bpo_callback,
        'Previously Sold BPO': stageMappings.previously_sold_bpo,
        'Returned To Center - DQ': stageMappings.returned_to_center_dq,
      };

      const pipelineStageId = statusToStageMap[row.status || ''] || stageMappings.pending_approval;

      if (!pipelineStageId) {
        toast({
          title: "Configuration Error",
          description: `No pipeline stage ID found for status: ${row.status}`,
          variant: "destructive",
        });
        return;
      }

      // Prepare the update payload
      const updatePayload = {
        pipelineId: stageMappings.transfer_api, // Using transfer_api as pipeline ID
        name: `${row.insured_name || 'Unknown'} - ${row.submission_id}`,
        pipelineStageId: pipelineStageId,
        status: 'open', // Default to open, can be mapped based on status
        monetaryValue: row.face_amount || 0,
        assignedTo: null, // Can be set if you have agent mapping
        customFields: [
          // Add any custom fields you want to sync
          // Example: { id: 'phone_field_id', field_value: row.client_phone_number }
        ]
      };

      console.log('GHL Sync Payload:', {
        opportunityId,
        locationId,
        pipelineId: stageMappings.transfer_api,
        pipelineStageId,
        status: row.status,
        payload: updatePayload
      });

      // Make the API call to GHL
      const response = await fetch(`https://services.leadconnectorhq.com/opportunities/${opportunityId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
          'Authorization': `Bearer ${locationSecret.api_token}`,
        },
        body: JSON.stringify(updatePayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`GHL API Error: ${response.status} - ${errorData.message || 'Unknown error'}`);
      }

      const result = await response.json();

      toast({
        title: "Sync Successful",
        description: `Successfully synced ${row.insured_name || 'Unknown'} to GHL`,
      });

      onDataUpdate(); // Refresh the data
    } catch (error) {
      console.error('Error syncing to GHL:', error);
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : `Failed to sync ${row.insured_name || 'Unknown'} to GHL`,
        variant: "destructive",
      });
    } finally {
      setSyncingRows(prev => {
        const newSet = new Set(prev);
        newSet.delete(row.id);
        return newSet;
      });
    }
  };

  // Handle view details
  const handleViewDetails = (row: GHLSyncRow) => {
    // TODO: Implement view details modal or navigation
    toast({
      title: "View Details",
      description: `Viewing details for ${row.insured_name || 'Unknown'}`,
    });
  };

  // Format currency values
  const formatCurrency = (value: number | null | undefined) => {
    if (value == null) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Format date values
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="w-full">
      <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#9CA3AF #F3F4F6' }}>
        <Table className="min-w-full">
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column} className={
                column === 'S.No' ? 'w-12' :
                column === 'Date' ? 'w-20' :
                column === 'Lead Vendor' ? 'w-20' :
                column === 'Insured Name' ? 'w-32' :
                column === 'Phone Number' ? 'w-28' :
                column === 'Agent' ? 'w-20' :
                column === 'Status' ? 'w-32' :
                column === 'Carrier' ? 'w-16' :
                column === 'Face Amount' ? 'w-20' :
                column === 'Notes' ? 'w-32' :
                column === 'Actions' ? 'w-32' : ''
              }>
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, index) => (
            <TableRow key={row.id} className="hover:bg-muted/50">
              {/* Serial Number */}
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {startIndex + index + 1}
              </td>

              {/* Date */}
              <td className="px-4 py-3 text-sm">
                {formatDate(row.date)}
              </td>

              {/* Lead Vendor */}
              <td className="px-4 py-3 text-sm">
                {row.lead_vendor || ''}
              </td>

              {/* Insured Name */}
              <td className="px-4 py-3 text-sm font-medium">
                {row.insured_name || ''}
              </td>

              {/* Phone Number */}
              <td className="px-4 py-3 text-sm">
                {row.client_phone_number || ''}
              </td>

              {/* Agent */}
              <td className="px-4 py-3 text-sm">
                {row.agent || ''}
              </td>

              {/* Status */}
              <td className="px-4 py-3 text-sm">
                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                  row.status === 'Pending Approval' ? 'bg-yellow-100 text-yellow-800' :
                  row.status === 'Needs BPO Callback' ? 'bg-blue-100 text-blue-800' :
                  row.status === 'Previously Sold BPO' ? 'bg-green-100 text-green-800' :
                  row.status === 'Returned To Center - DQ' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {row.status || ''}
                </span>
              </td>

              {/* Carrier */}
              <td className="px-4 py-3 text-sm">
                {row.carrier || ''}
              </td>

              {/* Face Amount */}
              <td className="px-4 py-3 text-sm text-right">
                {formatCurrency(row.face_amount)}
              </td>

              {/* Notes */}
              <td className="px-4 py-3 text-sm max-w-32 truncate">
                {row.notes || ''}
              </td>

              {/* Actions */}
              {hasWritePermissions && (
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDetails(row)}
                      className="h-8 px-2"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View
                    </Button>

                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleSyncToGHL(row)}
                      disabled={syncingRows.has(row.id)}
                      className="h-8 px-2"
                    >
                      <Zap className={`h-3 w-3 mr-1 ${syncingRows.has(row.id) ? 'animate-pulse' : ''}`} />
                      {syncingRows.has(row.id) ? 'Syncing...' : 'Sync'}
                    </Button>
                  </div>
                </td>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {data.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No data available
        </div>
      )}

      {/* Pagination Controls */}
      {totalRecords > 0 && (
        <div className="flex items-center justify-between px-4 py-4 border-t">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1} to {Math.min(endIndex, totalRecords)} of {totalRecords} entries
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goToFirstPage}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={goToPrevPage}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center space-x-1">
              <span className="text-sm text-muted-foreground">Page</span>
              <span className="text-sm font-medium">{currentPage}</span>
              <span className="text-sm text-muted-foreground">of</span>
              <span className="text-sm font-medium">{totalPages}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={goToLastPage}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};