package com.saksham.expense;

import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

interface UserRepository extends JpaRepository<User,String> {
    Optional<User> findByEmail(String email);
    List<User> findByRole(String role);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select u from User u where u.id=:id")
    Optional<User> lockById(@Param("id") String id);
}
interface TransactionRepository extends JpaRepository<Transaction,String> {
    List<Transaction> findByUserIdOrderByDateDescCreatedAtDesc(String userId);
    List<Transaction> findByUserIdAndDateBetweenOrderByDateAsc(String userId,LocalDate start,LocalDate end);
    Optional<Transaction> findByIdAndUserId(String id,String userId);
    Optional<Transaction> findByUserIdAndImportKey(String userId,String key);
}
interface BudgetRepository extends JpaRepository<Budget,String> {
    List<Budget> findByUserId(String userId);
    Optional<Budget> findByUserIdAndMonthAndCategory(String userId,String month,String category);
}
interface InboxRepository extends JpaRepository<InboxEntry,String> {
    List<InboxEntry> findByUserIdOrderByReceivedAtDesc(String userId);
    Optional<InboxEntry> findByIdAndUserId(String id,String userId);
    Optional<InboxEntry> findByUserIdAndKey(String userId,String key);
}
interface AuditRepository extends JpaRepository<AuditEvent,String> {
    List<AuditEvent> findTop100ByUserIdOrderByAtDesc(String userId);
}
interface RefreshRepository extends JpaRepository<RefreshToken,String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select r from RefreshToken r join fetch r.user where r.hash=:hash")
    Optional<RefreshToken> lockByHash(@Param("hash") String hash);
    void deleteByUserId(String userId);
}
interface RecurringRepository extends JpaRepository<RecurringTransaction,String> {
    List<RecurringTransaction> findByUserIdAndArchivedFalseOrderByNextDateAsc(String userId);
    Optional<RecurringTransaction> findByIdAndUserIdAndArchivedFalse(String id,String userId);
    @Query("select distinct r.user.id from RecurringTransaction r where r.active=true and r.archived=false and r.autoPost=true and r.user.active=true")
    List<String> automaticOwners();
}
interface RecurringOccurrenceRepository extends JpaRepository<RecurringOccurrence,String> {
    boolean existsByRecurringIdAndDueDate(String recurringId,LocalDate dueDate);
    boolean existsByRecurringId(String recurringId);
}
